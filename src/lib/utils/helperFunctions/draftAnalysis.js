import { leagueID } from '$lib/utils/leagueInfo';
import { getLeagueTeamManagers } from './leagueTeamManagers';
import { allSettledWithConcurrency } from './request';

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

async function fetchJson(url) {
  const res = await fetch(url, { compress: true });
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.json();
}

async function collectSeasonChain() {
  const seasons = [];
  let curID = leagueID;
  while (curID && curID !== '0') {
    let data;
    try { data = await fetchJson(`https://api.sleeper.app/v1/league/${curID}`); }
    catch (e) { console.warn('draftAnalysis: failed', curID, e); break; }
    seasons.push({ year: Number(data.season), seasonID: curID, playoffWeekStart: data.settings?.playoff_week_start ?? 15 });
    const prev = data.previous_league_id;
    curID = prev && prev !== '0' ? prev : null;
  }
  return seasons;
}

// Every season's matchup weeks through one pooled queue (this used to
// drain season by season). A failed week degrades to an empty week,
// matching the old per-season tolerance.
async function fetchAllSeasonMatchups(seasonChain) {
  const tasks = [];
  const meta = [];
  for (const { seasonID, playoffWeekStart } of seasonChain) {
    const weekCount = Math.max(playoffWeekStart - 1, 1);
    for (let w = 1; w <= weekCount; w++) {
      tasks.push(async () => {
        try {
          const res = await fetch(`https://api.sleeper.app/v1/league/${seasonID}/matchups/${w}`);
          const body = await res.json();
          return Array.isArray(body) ? body : [];
        } catch { return []; }
      });
      meta.push({ seasonID, week: w });
    }
  }
  const results = await allSettledWithConcurrency(tasks, 10);
  const bySeason = new Map(seasonChain.map(s => [s.seasonID, []]));
  results.forEach((r, i) => {
    const m = meta[i];
    bySeason.get(m.seasonID).push({ week: m.week, entries: r.status === 'fulfilled' ? r.value : [] });
  });
  return bySeason;
}

function accumulatePoints(matchups, map) {
  for (const { entries } of matchups) {
    for (const entry of entries) {
      const starters = entry.starters || [];
      const starterPtsArr = entry.starters_points || [];
      for (const [pid, pts] of Object.entries(entry.players_points || {})) {
        if (!map.has(pid)) map.set(pid, { starterPts: 0, rosterPts: 0 });
        map.get(pid).rosterPts += pts || 0;
      }
      starters.forEach((pid, idx) => {
        if (!pid) return;
        if (!map.has(pid)) map.set(pid, { starterPts: 0, rosterPts: 0 });
        map.get(pid).starterPts += starterPtsArr[idx] || 0;
      });
    }
  }
}

// Session-level memo: the Draft Analysis page and Manager Overview both
// call this builder and its result is deterministic within a session, so
// build once and share (cleared on failure so a retry can succeed).
let draftAnalysisPromise = null;
export function buildDraftAnalysisData(args) {
  if (!draftAnalysisPromise) {
    draftAnalysisPromise = buildDraftAnalysisDataImpl(args).catch((e) => { draftAnalysisPromise = null; throw e; });
  }
  return draftAnalysisPromise;
}

async function buildDraftAnalysisDataImpl({ players }) {
  const [teamManagers, seasonChain] = await Promise.all([getLeagueTeamManagers(), collectSeasonChain()]);
  const { teamManagersMap, users } = teamManagers;

  function getManagerName(rosterID, year) {
    const rid = String(rosterID);
    const yearsToTry = [String(year), ...Object.keys(teamManagersMap).sort((a, b) => b - a)];
    for (const y of yearsToTry) {
      const info = teamManagersMap[y]?.[rid];
      if (!info) continue;
      const primaryUserID = info.managers?.[0];
      if (primaryUserID && users[primaryUserID]?.display_name) return users[primaryUserID].display_name;
    }
    return `Team ${rid}`;
  }

  function getPlayerInfo(pid) {
    const p = players[pid];
    if (!p) return { name: `Player ${pid}`, position: 'Other' };
    const pos = p.fantasy_positions?.[0] || p.position || 'Other';
    return { name: `${p.first_name} ${p.last_name}`, position: POSITIONS.includes(pos) ? pos : 'Other' };
  }

  // Build per-season points maps (reused across all drafts)
  const perSeasonPoints = new Map(); // year -> Map<pid, {starterPts, rosterPts}>
  const matchupsBySeason = await fetchAllSeasonMatchups(seasonChain);
  for (const { year, seasonID } of seasonChain) {
    const m = new Map();
    accumulatePoints(matchupsBySeason.get(seasonID) || [], m);
    perSeasonPoints.set(year, m);
  }

  function getPlayerPointsFromYear(pid, draftYear) {
    let starterPts = 0, rosterPts = 0;
    for (const [year, map] of perSeasonPoints) {
      if (year >= draftYear) {
        const pts = map.get(pid);
        if (pts) { starterPts += pts.starterPts; rosterPts += pts.rosterPts; }
      }
    }
    return { starterPts: Math.round(starterPts * 10) / 10, rosterPts: Math.round(rosterPts * 10) / 10 };
  }

  const earliestYear = Math.min(...seasonChain.map(s => s.year));
  const enrichedDrafts = [];

  // Fetch every season's draft list, then every draft's payloads, in
  // parallel (this used to drain season by season, then draft by draft).
  const draftsInfoPerSeason = await Promise.all(seasonChain.map(async ({ seasonID }) => {
    try { return await fetchJson(`https://api.sleeper.app/v1/league/${seasonID}/drafts`); }
    catch (e) { console.warn('draftAnalysis: draft fetch failed for', seasonID, e); return []; }
  }));
  const draftJobs = [];
  seasonChain.forEach(({ year }, i) => {
    for (const draftMeta of draftsInfoPerSeason[i] || []) {
      if (draftMeta.status !== 'complete') continue;
      const rounds = draftMeta.settings?.rounds || 0;
      // Skip startup drafts (many rounds in the earliest year)
      if (year === earliestYear && rounds > 10) continue;
      draftJobs.push({ year, draftMeta, rounds });
    }
  });
  const draftPayloads = await Promise.all(draftJobs.map(async ({ draftMeta }) => {
    const draftID = draftMeta.draft_id;
    try {
      const [officialDraft, tradedPicks, draftPicks] = await Promise.all([
        fetchJson(`https://api.sleeper.app/v1/draft/${draftID}`),
        fetchJson(`https://api.sleeper.app/v1/draft/${draftID}/traded_picks`),
        fetchJson(`https://api.sleeper.app/v1/draft/${draftID}/picks`),
      ]);
      return { officialDraft, tradedPicks, draftPicks };
    } catch (e) { console.warn('draftAnalysis: draft fetch failed for', draftID, e); return null; }
  }));

  draftJobs.forEach(({ year, draftMeta, rounds }, i) => {
    const payload = draftPayloads[i];
    if (!payload) return;
    const { officialDraft, tradedPicks, draftPicks } = payload;
    const draftID = draftMeta.draft_id;

    // slot_to_roster_id maps draft slot (string key) -> roster_id (number)
    // This tells us which roster originally owned each slot
    const slotToRosterID = officialDraft.slot_to_roster_id || {};

    // Build a map: (round, originalOwnerRosterID) -> currentOwnerRosterID
    // Use traded_picks where roster_id = original owner, owner_id = current owner
    const tradeMap = new Map(); // key: `${round}_${originalRosterID}` -> currentOwnerRosterID
    for (const tp of tradedPicks) {
      // Only record actually-traded picks (owner changed)
      if (String(tp.owner_id) !== String(tp.roster_id)) {
        tradeMap.set(`${tp.round}_${String(tp.roster_id)}`, String(tp.owner_id));
      }
    }

    // Process each actual pick made in the draft
    const picks = draftPicks.map(p => {
      // draft_slot tells us which slot this pick was made in (1-based)
      const slot = p.draft_slot;
      // Look up the ORIGINAL owner of this slot from the draft order
      const originalOwnerRosterID = String(slotToRosterID[slot] ?? p.roster_id);
      // Check if this pick was traded away
      const tradeKey = `${p.round}_${originalOwnerRosterID}`;
      const currentOwnerRosterID = tradeMap.get(tradeKey) ?? originalOwnerRosterID;
      const wasTraded = currentOwnerRosterID !== originalOwnerRosterID;

      const info = getPlayerInfo(p.player_id);
      const pts = getPlayerPointsFromYear(p.player_id, year);

      return {
        round: p.round,
        slot,
        playerID: p.player_id,
        playerName: info.name,
        position: info.position,
        originalOwnerRosterID,
        actualOwnerRosterID: currentOwnerRosterID,
        originalManager: wasTraded ? getManagerName(originalOwnerRosterID, year) : null,
        manager: getManagerName(currentOwnerRosterID, year),
        wasTraded,
        starterPts: pts.starterPts,
        rosterPts: pts.rosterPts,
      };
    });

    enrichedDrafts.push({ year, draftID, draftType: draftMeta.type, rounds, picks });
  });

  enrichedDrafts.sort((a, b) => b.year - a.year);

  // Build team-level aggregates
  const teamStats = new Map();
  const posKeys = [...POSITIONS, 'Other'];
  const ensureTeam = name => {
    if (!teamStats.has(name)) {
      const posBreakdown = {};
      for (const pos of posKeys) posBreakdown[pos] = { starterPts: 0, rosterPts: 0, count: 0 };
      teamStats.set(name, { manager: name, totalPicks: 0, totalStarterPts: 0, totalRosterPts: 0, bestPick: null, posBreakdown, yearBreakdown: {} });
    }
    return teamStats.get(name);
  };

  for (const draft of enrichedDrafts) {
    for (const pick of draft.picks) {
      const ts = ensureTeam(pick.manager);
      ts.totalPicks++;
      ts.totalStarterPts += pick.starterPts;
      ts.totalRosterPts += pick.rosterPts;
      if (!ts.bestPick || pick.starterPts > ts.bestPick.starterPts) ts.bestPick = { ...pick, year: draft.year };
      const pos = POSITIONS.includes(pick.position) ? pick.position : 'Other';
      ts.posBreakdown[pos].starterPts += pick.starterPts;
      ts.posBreakdown[pos].rosterPts += pick.rosterPts;
      ts.posBreakdown[pos].count++;
      if (!ts.yearBreakdown[draft.year]) ts.yearBreakdown[draft.year] = { starterPts: 0, rosterPts: 0, picks: 0 };
      ts.yearBreakdown[draft.year].starterPts += pick.starterPts;
      ts.yearBreakdown[draft.year].rosterPts += pick.rosterPts;
      ts.yearBreakdown[draft.year].picks++;
    }
  }

  const teamSummary = [...teamStats.values()].map(t => ({
    ...t,
    avgStarterPtsPerPick: t.totalPicks > 0 ? Math.round((t.totalStarterPts / t.totalPicks) * 10) / 10 : 0,
    avgRosterPtsPerPick: t.totalPicks > 0 ? Math.round((t.totalRosterPts / t.totalPicks) * 10) / 10 : 0,
  }));

  const years = [...new Set(enrichedDrafts.map(d => d.year))].sort((a, b) => a - b);

  const yearTrends = years.map(year => {
    const draft = enrichedDrafts.find(d => d.year === year);
    if (!draft) return null;
    const byManager = {};
    for (const pick of draft.picks) {
      if (!byManager[pick.manager]) byManager[pick.manager] = { starterPts: 0, rosterPts: 0, picks: 0 };
      byManager[pick.manager].starterPts += pick.starterPts;
      byManager[pick.manager].rosterPts += pick.rosterPts;
      byManager[pick.manager].picks++;
    }
    return { year, byManager };
  }).filter(Boolean);

  return { drafts: enrichedDrafts, teamSummary, yearTrends, years, managers: [...new Set(teamSummary.map(t => t.manager))].sort() };
}
