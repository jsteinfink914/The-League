import { leagueID } from '$lib/utils/leagueInfo';
import { getLeagueTeamManagers } from './leagueTeamManagers';
import { allSettledWithConcurrency, fetchJson } from './request';
import { requireCompleteWeekResults } from './completeWeekResults';
import { effectiveTradeWeek } from './tradeWeek';

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

async function collectSeasonChain() {
  const seasons = [];
  let curID = leagueID;
  while (curID && curID !== '0') {
    let data;
    data = await fetchJson(`https://api.sleeper.app/v1/league/${curID}`);
    seasons.push({ year: Number(data.season), seasonID: curID, playoffWeekStart: data.settings?.playoff_week_start ?? 15 });
    const prev = data.previous_league_id;
    curID = prev && prev !== '0' ? prev : null;
  }
  return seasons;
}

async function fetchAllTransactions(seasonChain) {
  const all = [];
  // seasonID -> Map(week -> latest `created` timestamp in that week's bucket).
  // Sleeper buckets a transaction by the week it was CREATED, so a trade that
  // was proposed in one week but only completed after that week's activity
  // ended actually belongs to the next week (see cutoff logic below).
  const weekActivity = new Map();
  // Pool every season's weeks through one concurrency-limited queue instead
  // of draining season by season (measured ~4.6x faster on the fetch layer).
  const tasks = [];
  const taskSeason = [];
  for (const { seasonID } of seasonChain) {
    for (let w = 1; w <= 18; w++) {
      tasks.push(() => fetchJson(`https://api.sleeper.app/v1/league/${seasonID}/transactions/${w}`, { compress: true }));
      taskSeason.push(seasonID);
    }
  }
  const results = await allSettledWithConcurrency(tasks, 10);
  const bySeason = new Map(seasonChain.map(s => [s.seasonID, []]));
  results.forEach((r, i) => bySeason.get(taskSeason[i]).push(r));
  for (const { seasonID } of seasonChain) {
    const batches = requireCompleteWeekResults(bySeason.get(seasonID), `Trade analysis transactions for season ${seasonID}`);
    const seasonActivity = new Map();
    batches.forEach((batch, weekIndex) => {
      const week = weekIndex + 1;
      for (const t of batch) {
        if (!t) continue;
        if (typeof t.created === 'number') {
          const prev = seasonActivity.get(week);
          if (prev == null || t.created > prev) seasonActivity.set(week, t.created);
        }
        if (t.type === 'trade' && t.status !== 'failed') all.push({ ...t, _seasonID: seasonID, _week: week });
      }
    });
    weekActivity.set(seasonID, seasonActivity);
  }
  return { trades: all, weekActivity };
}

async function fetchAllMatchups(seasonChain) {
  // Same pooling as transactions: one queue for every season's weeks.
  const tasks = [];
  const taskSeason = [];
  for (const { seasonID, playoffWeekStart } of seasonChain) {
    const weekCount = Math.max(playoffWeekStart - 1, 1);
    for (let w = 1; w <= weekCount; w++) {
      tasks.push(() => fetchJson(`https://api.sleeper.app/v1/league/${seasonID}/matchups/${w}`, { compress: true }));
      taskSeason.push(seasonID);
    }
  }
  const results = await allSettledWithConcurrency(tasks, 10);
  const bySeason = new Map(seasonChain.map(s => [s.seasonID, []]));
  results.forEach((r, i) => bySeason.get(taskSeason[i]).push(r));
  const perSeason = new Map();
  for (const { seasonID } of seasonChain) {
    const checked = requireCompleteWeekResults(bySeason.get(seasonID), `Trade analysis matchups for season ${seasonID}`);
    perSeason.set(seasonID, checked.map((entries, i) => ({ week: i + 1, entries })));
  }
  return perSeason;
}

async function buildWeeklyPlayerPoints(seasonChain) {
  // playerID -> Map(year -> Map(week -> { starterPts, rosterPts }))
  const weeklyPoints = new Map();
  const ensureWeek = (pid, year, week) => {
    if (!weeklyPoints.has(pid)) weeklyPoints.set(pid, new Map());
    const byYear = weeklyPoints.get(pid);
    if (!byYear.has(year)) byYear.set(year, new Map());
    const byWeek = byYear.get(year);
    if (!byWeek.has(week)) byWeek.set(week, { starterPts: 0, rosterPts: 0 });
    return byWeek.get(week);
  };
  const matchupsBySeason = await fetchAllMatchups(seasonChain);
  for (const { seasonID, year } of seasonChain) {
    const matchups = matchupsBySeason.get(seasonID) || [];
    for (const { week, entries } of matchups) {
      for (const entry of entries) {
        const starters = entry.starters || [];
        const starterPtsArr = entry.starters_points || [];
        for (const [pid, pts] of Object.entries(entry.players_points || {})) ensureWeek(pid, year, week).rosterPts += pts || 0;
        starters.forEach((pid, idx) => { if (pid) ensureWeek(pid, year, week).starterPts += starterPtsArr[idx] || 0; });
      }
    }
  }
  return weeklyPoints;
}

// Total a player's production from a trade onward: in the trade's own season,
// only weeks from the trade's week onward count; later seasons count in full.
function playerPointsSince(weeklyPoints, playerID, fromYear, fromWeek) {
  const totals = { starterPts: 0, rosterPts: 0 };
  const byYear = weeklyPoints.get(playerID);
  if (!byYear) return totals;
  for (const [year, byWeek] of byYear) {
    if (year < fromYear) continue;
    for (const [week, pts] of byWeek) {
      if (year === fromYear && week < fromWeek) continue;
      totals.starterPts += pts.starterPts;
      totals.rosterPts += pts.rosterPts;
    }
  }
  return totals;
}

async function fetchAllDraftsData(seasonChain) {
  const listResults = await allSettledWithConcurrency(
    seasonChain.map(({ seasonID }) => () => fetchJson(`https://api.sleeper.app/v1/league/${seasonID}/drafts`)),
    10
  );
  const failed = listResults.find(r => r.status === 'rejected');
  if (failed) throw failed.reason;
  const jobs = [];
  listResults.forEach((res, i) => {
    const { year } = seasonChain[i];
    for (const draftMeta of res.value) {
      if (draftMeta.status !== 'complete') continue;
      jobs.push(async () => {
        const [officialDraft, draftPicks] = await Promise.all([
          fetchJson(`https://api.sleeper.app/v1/draft/${draftMeta.draft_id}`),
          fetchJson(`https://api.sleeper.app/v1/draft/${draftMeta.draft_id}/picks`)
        ]);
        const slotToRosterID = officialDraft.slot_to_roster_id || {};
        const picks = draftPicks.map(p => ({
          round: p.round,
          playerID: p.player_id,
          pickedByRosterID: String(p.roster_id),
          originalOwnerRosterID: String(slotToRosterID[p.draft_slot] ?? p.roster_id)
        }));
        return { year, draftID: draftMeta.draft_id, picks };
      });
    }
  });
  const results = await allSettledWithConcurrency(jobs, 10);
  const failedJob = results.find(r => r.status === 'rejected');
  if (failedJob) throw failedJob.reason;
  return results.map(r => r.value);
}

export const pickKeyOf = (season, round, originalOwnerRosterID) => `${season}|${round}|${originalOwnerRosterID}`;

function resolvePickToPlayer(pick, allDrafts) {
  const targetYear = parseInt(pick.season);
  const targetRound = parseInt(pick.round);
  const originalOwner = pick.original_owner ? String(pick.original_owner) : null;
  for (const draft of allDrafts.filter(d => d.year === targetYear)) {
    for (const p of draft.picks) {
      if (p.round !== targetRound) continue;
      if (originalOwner && p.originalOwnerRosterID !== originalOwner) continue;
      return p.playerID;
    }
  }
  return null;
}

export async function buildTradeAnalysisData({ players }) {
  const [teamManagers, seasonChain] = await Promise.all([getLeagueTeamManagers(), collectSeasonChain()]);
  const { teamManagersMap, currentSeason, users } = teamManagers;

  // Build a stable rosterID+year -> canonical name map
  // Uses users[userID].display_name (set from leagueInfo.managers) so name changes don't split teams
  const yearRosterToUserID = {};
  for (const [year, rosters] of Object.entries(teamManagersMap)) {
    yearRosterToUserID[year] = {};
    for (const [rosterID, info] of Object.entries(rosters)) {
      const primaryUserID = info.managers?.[0];
      yearRosterToUserID[year][String(rosterID)] = primaryUserID || null;
    }
  }

  function getCanonicalName(rosterID, year) {
    // Try the exact year first, then fall back to closest year
    const yearsToTry = [String(year), ...Object.keys(yearRosterToUserID).sort((a, b) => b - a)];
    for (const y of yearsToTry) {
      const userID = yearRosterToUserID[y]?.[String(rosterID)];
      if (userID && users[userID]?.display_name) return users[userID].display_name;
    }
    return `Team ${rosterID}`;
  }

  function getPlayerInfo(pid) {
    const p = players[pid];
    if (!p) return { name: `Player ${pid}`, position: 'Other' };
    const pos = p.fantasy_positions?.[0] || p.position || 'Other';
    return { name: `${p.first_name} ${p.last_name}`, position: POSITIONS.includes(pos) ? pos : 'Other' };
  }

  const [{ trades: rawTrades, weekActivity }, allDrafts] = await Promise.all([fetchAllTransactions(seasonChain), fetchAllDraftsData(seasonChain)]);

  // Draft lineage for asset tracing: who drafted each player (and whether
  // the pick they used had been traded to them), and who each traded pick
  // ultimately drafted.
  const draftInfo = { playerOrigin: {}, pickDraftedBy: {} };
  for (const draft of allDrafts) {
    for (const p of draft.picks) {
      const key = pickKeyOf(draft.year, p.round, p.originalOwnerRosterID);
      draftInfo.pickDraftedBy[key] = { playerID: p.playerID, playerName: getPlayerInfo(p.playerID).name, manager: getCanonicalName(p.pickedByRosterID, draft.year) };
      draftInfo.playerOrigin[p.playerID] = {
        manager: getCanonicalName(p.pickedByRosterID, draft.year),
        year: draft.year,
        round: p.round,
        pickKey: p.pickedByRosterID !== p.originalOwnerRosterID ? key : null
      };
    }
  }

  const seenIDs = new Set();
  const uniqueTrades = [];
  for (const t of rawTrades) {
    if (!seenIDs.has(t.transaction_id)) { seenIDs.add(t.transaction_id); uniqueTrades.push(t); }
  }
  uniqueTrades.sort((a, b) => b.status_updated - a.status_updated);

  const tradesByYear = {};
  const processedTrades = [];

  for (const trade of uniqueTrades) {
    const season = seasonChain.find(s => s.seasonID === trade._seasonID);
    const effectiveYear = season ? season.year : new Date(trade.status_updated).getFullYear();
    const rosterIDs = trade.roster_ids || [];
    const adds = trade.adds || {};
    const drops = trade.drops || {};
    const draftPicks = trade.draft_picks || [];
    // Provenance: drops names the roster each player came FROM, and each
    // draft pick carries previous_owner_id. Without it, "given" can only be
    // approximated as everyone else's received (exact for 2-way trades,
    // wrong for multi-way — see the points phase below).
    const hasProvenance = Object.keys(drops).length > 0 || draftPicks.some(p => p.previous_owner_id != null);
    const giverByPlayer = {};
    for (const [playerID, fromRosterID] of Object.entries(drops)) giverByPlayer[playerID] = String(fromRosterID);

    const sides = {};
    for (const rid of rosterIDs) {
      sides[String(rid)] = {
        rosterID: String(rid),
        manager: getCanonicalName(rid, effectiveYear),
        players: [], picks: [], pendingPickCount: 0,
        givenPlayers: [], givenPicks: [],
        playerDetails: [], pickDetails: [],
        starterPts: 0, rosterPts: 0, givenStarterPts: 0, givenRosterPts: 0, netStarterSurplus: 0, netRosterSurplus: 0
      };
    }

    for (const [playerID, receivingRosterID] of Object.entries(adds)) {
      const key = String(receivingRosterID);
      if (sides[key]) sides[key].players.push(playerID);
    }
    for (const [playerID, fromRosterID] of Object.entries(drops)) {
      const key = String(fromRosterID);
      if (sides[key]) sides[key].givenPlayers.push(playerID);
    }

    for (const pick of draftPicks) {
      const key = String(pick.owner_id);
      if (!sides[key]) continue;
      const pickYear = parseInt(pick.season);
      const resolvedPlayer = resolvePickToPlayer({ season: pick.season, round: pick.round, original_owner: pick.roster_id }, allDrafts);
      sides[key].picks.push({ season: pick.season, round: pick.round, originalOwner: pick.roster_id, resolvedPlayerID: resolvedPlayer, isPending: !resolvedPlayer && pickYear >= currentSeason, fromRosterID: pick.previous_owner_id != null ? String(pick.previous_owner_id) : null });
      if (pick.previous_owner_id != null) {
        const giverKey = String(pick.previous_owner_id);
        if (sides[giverKey]) sides[giverKey].givenPicks.push({ season: pick.season, round: pick.round, originalOwner: pick.roster_id, resolvedPlayerID: resolvedPlayer });
      }
    }

    for (const side of Object.values(sides)) side.pendingPickCount = side.picks.filter(p => p.isPending).length;

    // Points count from the week the trade COMPLETED (see tradeWeek.js).
    const cutoffWeek = effectiveTradeWeek(trade, weekActivity);

    const processedTrade = {
      id: trade.transaction_id,
      date: new Date(trade.status_updated).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      timestamp: trade.status_updated, year: effectiveYear, week: cutoffWeek, sides: Object.values(sides),
      hasProvenance, giverByPlayer
    };
    processedTrades.push(processedTrade);
    if (!tradesByYear[effectiveYear]) tradesByYear[effectiveYear] = [];
    tradesByYear[effectiveYear].push(processedTrade);
  }

  const weeklyPoints = await buildWeeklyPlayerPoints(seasonChain);
  for (const year of Object.keys(tradesByYear).map(Number).sort()) {
    for (const trade of tradesByYear[year]) {
      const fromWeek = trade.week ?? 1;
      for (const side of trade.sides) {
        let starterPts = 0, rosterPts = 0;
        // Player/pick split of the same totals, so the overview can show
        // how much of a manager's net came from players vs draft picks.
        let recvPlayerS = 0, recvPlayerR = 0, recvPickS = 0, recvPickR = 0;
        side.playerDetails = side.players.map(pid => {
          const info = getPlayerInfo(pid);
          const pts = playerPointsSince(weeklyPoints, pid, year, fromWeek);
          starterPts += pts.starterPts; rosterPts += pts.rosterPts;
          recvPlayerS += pts.starterPts; recvPlayerR += pts.rosterPts;
          const giverRID = trade.giverByPlayer?.[pid];
          const fromManager = giverRID
            ? getCanonicalName(giverRID, year)
            : (trade.sides.length === 2 ? trade.sides.find(s => s !== side)?.manager || null : null);
          return { playerID: pid, name: info.name, position: info.position, fromManager, starterPts: Math.round(pts.starterPts * 10) / 10, rosterPts: Math.round(pts.rosterPts * 10) / 10 };
        });
        side.pickDetails = side.picks.map(pick => {
          const info = pick.resolvedPlayerID ? getPlayerInfo(pick.resolvedPlayerID) : null;
          const pts = pick.resolvedPlayerID ? playerPointsSince(weeklyPoints, pick.resolvedPlayerID, year, fromWeek) : { starterPts: 0, rosterPts: 0 };
          if (pick.resolvedPlayerID) { starterPts += pts.starterPts; rosterPts += pts.rosterPts; recvPickS += pts.starterPts; recvPickR += pts.rosterPts; }
          const fromManager = pick.fromRosterID
            ? getCanonicalName(pick.fromRosterID, year)
            : (trade.sides.length === 2 ? trade.sides.find(s => s !== side)?.manager || null : null);
          return {
            ...pick,
            resolvedName: info?.name || null, resolvedPosition: info?.position || null,
            fromManager,
            originalOwnerManager: getCanonicalName(pick.originalOwner, year),
            pickKey: pickKeyOf(pick.season, pick.round, String(pick.originalOwner)),
            starterPts: Math.round(pts.starterPts * 10) / 10, rosterPts: Math.round(pts.rosterPts * 10) / 10
          };
        });
        side.starterPts = Math.round(starterPts * 10) / 10;
        side.rosterPts = Math.round(rosterPts * 10) / 10;
        side.receivedPlayerStarterPts = Math.round(recvPlayerS * 10) / 10;
        side.receivedPlayerRosterPts = Math.round(recvPlayerR * 10) / 10;
        side.receivedPickStarterPts = Math.round(recvPickS * 10) / 10;
        side.receivedPickRosterPts = Math.round(recvPickR * 10) / 10;
        // What this side GAVE: the same production function applied to the
        // assets that left its roster (identical values to what receivers
        // were credited, so nets are zero-sum for any trade size).
        let givenStarter = 0, givenRoster = 0;
        let givPlayerS = 0, givPlayerR = 0, givPickS = 0, givPickR = 0;
        for (const pid of side.givenPlayers || []) {
          const pts = playerPointsSince(weeklyPoints, pid, year, fromWeek);
          givenStarter += pts.starterPts; givenRoster += pts.rosterPts;
          givPlayerS += pts.starterPts; givPlayerR += pts.rosterPts;
        }
        for (const gp of side.givenPicks || []) {
          if (!gp.resolvedPlayerID) continue;
          const pts = playerPointsSince(weeklyPoints, gp.resolvedPlayerID, year, fromWeek);
          givenStarter += pts.starterPts; givenRoster += pts.rosterPts;
          givPickS += pts.starterPts; givPickR += pts.rosterPts;
        }
        side.givenStarterPts = Math.round(givenStarter * 10) / 10;
        side.givenRosterPts = Math.round(givenRoster * 10) / 10;
        side.givenPlayerStarterPts = Math.round(givPlayerS * 10) / 10;
        side.givenPlayerRosterPts = Math.round(givPlayerR * 10) / 10;
        side.givenPickStarterPts = Math.round(givPickS * 10) / 10;
        side.givenPickRosterPts = Math.round(givPickR * 10) / 10;
      }
      for (let i = 0; i < trade.sides.length; i++) {
        const mySide = trade.sides[i];
        if (trade.hasProvenance) {
          mySide.netStarterSurplus = Math.round((mySide.starterPts - mySide.givenStarterPts) * 10) / 10;
          mySide.netRosterSurplus = Math.round((mySide.rosterPts - mySide.givenRosterPts) * 10) / 10;
        } else {
          const othersStarter = trade.sides.filter((_, j) => j !== i).reduce((s, o) => s + (o.starterPts || 0), 0);
          const othersRoster = trade.sides.filter((_, j) => j !== i).reduce((s, o) => s + (o.rosterPts || 0), 0);
          mySide.netStarterSurplus = Math.round((mySide.starterPts - othersStarter) * 10) / 10;
          mySide.netRosterSurplus = Math.round((mySide.rosterPts - othersRoster) * 10) / 10;
        }
      }
    }
  }

  const teamStats = new Map();
  const posKeys = [...POSITIONS, 'Other'];
  const ensureTeam = name => {
    if (!teamStats.has(name)) {
      const posBreakdown = {};
      for (const pos of posKeys) posBreakdown[pos] = { starterPts: 0, rosterPts: 0, count: 0 };
      teamStats.set(name, { manager: name, tradeCount: 0, totalReceivedStarter: 0, totalReceivedRoster: 0, totalGivenStarter: 0, totalGivenRoster: 0, totalReceivedPlayerStarter: 0, totalReceivedPlayerRoster: 0, totalGivenPlayerStarter: 0, totalGivenPlayerRoster: 0, totalReceivedPickStarter: 0, totalReceivedPickRoster: 0, totalGivenPickStarter: 0, totalGivenPickRoster: 0, pendingPickCount: 0, posBreakdown });
    }
    return teamStats.get(name);
  };

  for (const trade of processedTrades) {
    for (let i = 0; i < trade.sides.length; i++) {
      const mySide = trade.sides[i];
      const ts = ensureTeam(mySide.manager);
      ts.tradeCount++; ts.totalReceivedStarter += mySide.starterPts || 0; ts.totalReceivedRoster += mySide.rosterPts || 0; ts.pendingPickCount += mySide.pendingPickCount || 0;
      ts.totalReceivedPlayerStarter += mySide.receivedPlayerStarterPts || 0; ts.totalReceivedPlayerRoster += mySide.receivedPlayerRosterPts || 0;
      ts.totalReceivedPickStarter += mySide.receivedPickStarterPts || 0; ts.totalReceivedPickRoster += mySide.receivedPickRosterPts || 0;
      if (trade.hasProvenance) {
        ts.totalGivenStarter += mySide.givenStarterPts || 0; ts.totalGivenRoster += mySide.givenRosterPts || 0;
        ts.totalGivenPlayerStarter += mySide.givenPlayerStarterPts || 0; ts.totalGivenPlayerRoster += mySide.givenPlayerRosterPts || 0;
        ts.totalGivenPickStarter += mySide.givenPickStarterPts || 0; ts.totalGivenPickRoster += mySide.givenPickRosterPts || 0;
      } else {
        for (let j = 0; j < trade.sides.length; j++) { if (j === i) continue; ts.totalGivenStarter += trade.sides[j].starterPts || 0; ts.totalGivenRoster += trade.sides[j].rosterPts || 0; ts.totalGivenPlayerStarter += trade.sides[j].receivedPlayerStarterPts || 0; ts.totalGivenPlayerRoster += trade.sides[j].receivedPlayerRosterPts || 0; ts.totalGivenPickStarter += trade.sides[j].receivedPickStarterPts || 0; ts.totalGivenPickRoster += trade.sides[j].receivedPickRosterPts || 0; }
      }
      for (const pd of (mySide.playerDetails || [])) { const pos = POSITIONS.includes(pd.position) ? pd.position : 'Other'; ts.posBreakdown[pos].starterPts += pd.starterPts; ts.posBreakdown[pos].rosterPts += pd.rosterPts; ts.posBreakdown[pos].count++; }
      for (const pd of (mySide.pickDetails || [])) { if (!pd.resolvedPlayerID) continue; const pos = POSITIONS.includes(pd.resolvedPosition) ? pd.resolvedPosition : 'Other'; ts.posBreakdown[pos].starterPts += pd.starterPts; ts.posBreakdown[pos].rosterPts += pd.rosterPts; ts.posBreakdown[pos].count++; }
    }
  }

  const teamSummary = [...teamStats.values()].map(t => ({
    ...t,
    netStarterSurplus: Math.round((t.totalReceivedStarter - t.totalGivenStarter) * 10) / 10,
    netRosterSurplus: Math.round((t.totalReceivedRoster - t.totalGivenRoster) * 10) / 10,
    playerNetStarterSurplus: Math.round((t.totalReceivedPlayerStarter - t.totalGivenPlayerStarter) * 10) / 10,
    playerNetRosterSurplus: Math.round((t.totalReceivedPlayerRoster - t.totalGivenPlayerRoster) * 10) / 10,
    pickNetStarterSurplus: Math.round((t.totalReceivedPickStarter - t.totalGivenPickStarter) * 10) / 10,
    pickNetRosterSurplus: Math.round((t.totalReceivedPickRoster - t.totalGivenPickRoster) * 10) / 10,
    avgStarterPtsPerTrade: t.tradeCount > 0 ? Math.round((t.totalReceivedStarter / t.tradeCount) * 10) / 10 : 0,
    avgRosterPtsPerTrade: t.tradeCount > 0 ? Math.round((t.totalReceivedRoster / t.tradeCount) * 10) / 10 : 0,
  }));

  return { trades: processedTrades, teamSummary, managers: [...new Set(teamSummary.map(t => t.manager))].sort(), draftInfo };
}

// The Most Traded Players aggregation lives in mostTradedMath.js
// (pure, shared with Ask); re-exported here for the page's import.
export { aggregateMostTradedPlayers } from './mostTradedMath';
