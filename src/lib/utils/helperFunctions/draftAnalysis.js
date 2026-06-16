import { leagueID } from '$lib/utils/leagueInfo';
import { getLeagueTeamManagers } from './leagueTeamManagers';

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

async function fetchSeasonMatchups(seasonID, playoffWeekStart) {
  const weekCount = Math.max(playoffWeekStart - 1, 1);
  const urls = [];
  for (let w = 1; w <= weekCount; w++) urls.push(`https://api.sleeper.app/v1/league/${seasonID}/matchups/${w}`);
  const responses = await Promise.all(urls.map(u => fetch(u)));
  const bodies = await Promise.all(responses.map(r => r.json()));
  return bodies.map((entries, i) => ({ week: i + 1, entries: Array.isArray(entries) ? entries : [] }));
}

function accumulateMatchupPoints(matchups, playerPoints) {
  for (const { entries } of matchups) {
    for (const entry of entries) {
      const starters = entry.starters || [];
      const starterPtsArr = entry.starters_points || [];
      for (const [pid, pts] of Object.entries(entry.players_points || {})) {
        if (!playerPoints.has(pid)) playerPoints.set(pid, { starterPts: 0, rosterPts: 0 });
        playerPoints.get(pid).rosterPts += pts || 0;
      }
      starters.forEach((pid, idx) => {
        if (pid) {
          if (!playerPoints.has(pid)) playerPoints.set(pid, { starterPts: 0, rosterPts: 0 });
          playerPoints.get(pid).starterPts += starterPtsArr[idx] || 0;
        }
      });
    }
  }
}

export async function buildDraftAnalysisData({ players }) {
  const [teamManagers, seasonChain] = await Promise.all([getLeagueTeamManagers(), collectSeasonChain()]);
  const { teamManagersMap, currentSeason } = teamManagers;

  function getManagerName(rosterID, year) {
    const y = String(year);
    if (teamManagersMap[y]?.[String(rosterID)]) return teamManagersMap[y][String(rosterID)].team?.name || `Team ${rosterID}`;
    for (const yr of Object.keys(teamManagersMap).sort((a, b) => b - a)) {
      if (teamManagersMap[yr]?.[String(rosterID)]) return teamManagersMap[yr][String(rosterID)].team?.name || `Team ${rosterID}`;
    }
    return `Team ${rosterID}`;
  }

  function getPlayerInfo(pid) {
    const p = players[pid];
    if (!p) return { name: `Player ${pid}`, position: 'Other' };
    const pos = p.fantasy_positions?.[0] || p.position || 'Other';
    return { name: `${p.first_name} ${p.last_name}`, position: POSITIONS.includes(pos) ? pos : 'Other' };
  }

  // Build all-time player points map (all seasons)
  const allTimePlayerPoints = new Map();
  for (const { seasonID, playoffWeekStart } of seasonChain) {
    try {
      const matchups = await fetchSeasonMatchups(seasonID, playoffWeekStart);
      accumulateMatchupPoints(matchups, allTimePlayerPoints);
    } catch (e) { console.warn('draftAnalysis: matchup fetch failed', seasonID, e); }
  }

  // Also build per-season player points for "points from draft year forward" calculation
  // We'll store cumulative points from each year onward
  const seasonYears = seasonChain.map(s => s.year).sort((a, b) => a - b);
  const perSeasonPoints = new Map(); // year -> Map<pid, {starterPts, rosterPts}>
  for (const { year, seasonID, playoffWeekStart } of seasonChain) {
    const m = new Map();
    try {
      const matchups = await fetchSeasonMatchups(seasonID, playoffWeekStart);
      accumulateMatchupPoints(matchups, m);
    } catch (e) { console.warn('draftAnalysis: season pts failed', seasonID, e); }
    perSeasonPoints.set(year, m);
  }

  // For a player drafted in draftYear: points = sum of perSeasonPoints for year >= draftYear
  function getPlayerPointsFromYear(pid, draftYear) {
    let starterPts = 0, rosterPts = 0;
    for (const [year, map] of perSeasonPoints) {
      if (year >= draftYear) {
        const pts = map.get(pid) || { starterPts: 0, rosterPts: 0 };
        starterPts += pts.starterPts;
        rosterPts += pts.rosterPts;
      }
    }
    return { starterPts: Math.round(starterPts * 10) / 10, rosterPts: Math.round(rosterPts * 10) / 10 };
  }

  // Fetch annual drafts (skip startup = lots of rounds in earliest year)
  const earliestYear = Math.min(...seasonChain.map(s => s.year));
  const enrichedDrafts = [];

  for (const { seasonID, year } of seasonChain) {
    try {
      const draftsInfo = await fetchJson(`https://api.sleeper.app/v1/league/${seasonID}/drafts`);
      for (const draftMeta of draftsInfo) {
        if (draftMeta.status !== 'complete') continue;
        const rounds = draftMeta.settings?.rounds || 0;
        // Skip startup drafts (identified by having many rounds, typically 20+, in the first year)
        if (year === earliestYear && rounds > 10) continue;

        const draftID = draftMeta.draft_id;
        const [tradedPicks, draftPicks] = await Promise.all([
          fetchJson(`https://api.sleeper.app/v1/draft/${draftID}/traded_picks`),
          fetchJson(`https://api.sleeper.app/v1/draft/${draftID}/picks`)
        ]);

        const tradeMap = new Map();
        for (const tp of tradedPicks) tradeMap.set(`${tp.round}_${tp.roster_id}`, String(tp.owner_id));

        const picks = draftPicks.map(p => {
          const actualOwner = tradeMap.get(`${p.round}_${p.roster_id}`) ?? String(p.roster_id);
          const wasTraded = actualOwner !== String(p.roster_id);
          const info = getPlayerInfo(p.player_id);
          const pts = getPlayerPointsFromYear(p.player_id, year);
          return {
            round: p.round,
            slot: p.draft_slot,
            playerID: p.player_id,
            playerName: info.name,
            position: info.position,
            originalOwnerRosterID: String(p.roster_id),
            actualOwnerRosterID: actualOwner,
            originalManager: wasTraded ? getManagerName(p.roster_id, year) : null,
            manager: getManagerName(actualOwner, year),
            wasTraded,
            starterPts: pts.starterPts,
            rosterPts: pts.rosterPts
          };
        });

        enrichedDrafts.push({ year, draftID, draftType: draftMeta.type, rounds, picks });
      }
    } catch (e) { console.warn('draftAnalysis: draft fetch failed for', seasonID, e); }
  }

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
