import { leagueID } from '$lib/utils/leagueInfo';
import { getLeagueTeamManagers } from './leagueTeamManagers';
import { allSettledWithConcurrency, fetchJson } from './request';
import { requireCompleteWeekResults } from './completeWeekResults';

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
  for (const { seasonID } of seasonChain) {
    const weekPromises = [];
    for (let w = 1; w <= 18; w++) {
      weekPromises.push(() => fetchJson(`https://api.sleeper.app/v1/league/${seasonID}/transactions/${w}`, { compress: true }));
    }
    const results = await allSettledWithConcurrency(weekPromises);
    const batches = requireCompleteWeekResults(results, `Trade analysis transactions for season ${seasonID}`);
    for (const batch of batches) {
      for (const t of batch) {
        if (t && t.type === 'trade' && t.status !== 'failed') all.push({ ...t, _seasonID: seasonID });
      }
    }
  }
  return all;
}

async function fetchSeasonMatchups(seasonID, playoffWeekStart) {
  const weekCount = Math.max(playoffWeekStart - 1, 1);
  const results = await allSettledWithConcurrency(
    Array.from({ length: weekCount }, (_, i) => () =>
      fetchJson(`https://api.sleeper.app/v1/league/${seasonID}/matchups/${i + 1}`, { compress: true })
    )
  );
  return requireCompleteWeekResults(results, `Trade analysis matchups for season ${seasonID}`)
    .map((entries, i) => ({ week: i + 1, entries }));
}

async function buildPlayerPointsFromYear(seasonChain, tradeYear) {
  const relevantSeasons = seasonChain.filter(s => s.year >= tradeYear);
  const playerPoints = new Map();
  const ensure = pid => { if (!playerPoints.has(pid)) playerPoints.set(pid, { starterPts: 0, rosterPts: 0 }); return playerPoints.get(pid); };
  for (const { seasonID, playoffWeekStart } of relevantSeasons) {
    const matchups = await fetchSeasonMatchups(seasonID, playoffWeekStart);
    for (const { entries } of matchups) {
      for (const entry of entries) {
        const starters = entry.starters || [];
        const starterPtsArr = entry.starters_points || [];
        for (const [pid, pts] of Object.entries(entry.players_points || {})) ensure(pid).rosterPts += pts || 0;
        starters.forEach((pid, idx) => { if (pid) ensure(pid).starterPts += starterPtsArr[idx] || 0; });
      }
    }
  }
  return playerPoints;
}

async function fetchAllDraftsData(seasonChain) {
  const allDrafts = [];
  for (const { seasonID, year } of seasonChain) {
    const draftsInfo = await fetchJson(`https://api.sleeper.app/v1/league/${seasonID}/drafts`);
    for (const draftMeta of draftsInfo) {
      if (draftMeta.status !== 'complete') continue;
      const [officialDraft, draftPicks] = await Promise.all([
        fetchJson(`https://api.sleeper.app/v1/draft/${draftMeta.draft_id}`),
        fetchJson(`https://api.sleeper.app/v1/draft/${draftMeta.draft_id}/picks`)
      ]);
      const slotToRosterID = officialDraft.slot_to_roster_id || {};
      const picks = draftPicks.map(p => ({
        round: p.round,
        playerID: p.player_id,
        originalOwnerRosterID: String(slotToRosterID[p.draft_slot] ?? p.roster_id)
      }));
      allDrafts.push({ year, draftID: draftMeta.draft_id, picks });
    }
  }
  return allDrafts;
}

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

  const [rawTrades, allDrafts] = await Promise.all([fetchAllTransactions(seasonChain), fetchAllDraftsData(seasonChain)]);

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
    const draftPicks = trade.draft_picks || [];

    const sides = {};
    for (const rid of rosterIDs) {
      sides[String(rid)] = {
        rosterID: String(rid),
        manager: getCanonicalName(rid, effectiveYear),
        players: [], picks: [], pendingPickCount: 0,
        playerDetails: [], pickDetails: [],
        starterPts: 0, rosterPts: 0, netStarterSurplus: 0, netRosterSurplus: 0
      };
    }

    for (const [playerID, receivingRosterID] of Object.entries(adds)) {
      const key = String(receivingRosterID);
      if (sides[key]) sides[key].players.push(playerID);
    }

    for (const pick of draftPicks) {
      const key = String(pick.owner_id);
      if (!sides[key]) continue;
      const pickYear = parseInt(pick.season);
      const resolvedPlayer = resolvePickToPlayer({ season: pick.season, round: pick.round, original_owner: pick.roster_id }, allDrafts);
      sides[key].picks.push({ season: pick.season, round: pick.round, originalOwner: pick.roster_id, resolvedPlayerID: resolvedPlayer, isPending: !resolvedPlayer && pickYear >= currentSeason });
    }

    for (const side of Object.values(sides)) side.pendingPickCount = side.picks.filter(p => p.isPending).length;

    const processedTrade = {
      id: trade.transaction_id,
      date: new Date(trade.status_updated).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      timestamp: trade.status_updated, year: effectiveYear, sides: Object.values(sides)
    };
    processedTrades.push(processedTrade);
    if (!tradesByYear[effectiveYear]) tradesByYear[effectiveYear] = [];
    tradesByYear[effectiveYear].push(processedTrade);
  }

  const yearPointsCache = new Map();
  for (const year of Object.keys(tradesByYear).map(Number).sort()) {
    if (!yearPointsCache.has(year)) yearPointsCache.set(year, await buildPlayerPointsFromYear(seasonChain, year));
    const playerPoints = yearPointsCache.get(year);

    for (const trade of tradesByYear[year]) {
      for (const side of trade.sides) {
        let starterPts = 0, rosterPts = 0;
        side.playerDetails = side.players.map(pid => {
          const info = getPlayerInfo(pid);
          const pts = playerPoints.get(pid) || { starterPts: 0, rosterPts: 0 };
          starterPts += pts.starterPts; rosterPts += pts.rosterPts;
          return { playerID: pid, name: info.name, position: info.position, starterPts: Math.round(pts.starterPts * 10) / 10, rosterPts: Math.round(pts.rosterPts * 10) / 10 };
        });
        side.pickDetails = side.picks.map(pick => {
          const info = pick.resolvedPlayerID ? getPlayerInfo(pick.resolvedPlayerID) : null;
          const pts = pick.resolvedPlayerID ? (playerPoints.get(pick.resolvedPlayerID) || { starterPts: 0, rosterPts: 0 }) : { starterPts: 0, rosterPts: 0 };
          if (pick.resolvedPlayerID) { starterPts += pts.starterPts; rosterPts += pts.rosterPts; }
          return { ...pick, resolvedName: info?.name || null, resolvedPosition: info?.position || null, starterPts: Math.round(pts.starterPts * 10) / 10, rosterPts: Math.round(pts.rosterPts * 10) / 10 };
        });
        side.starterPts = Math.round(starterPts * 10) / 10;
        side.rosterPts = Math.round(rosterPts * 10) / 10;
      }
      for (let i = 0; i < trade.sides.length; i++) {
        const mySide = trade.sides[i];
        const othersStarter = trade.sides.filter((_, j) => j !== i).reduce((s, o) => s + (o.starterPts || 0), 0);
        const othersRoster = trade.sides.filter((_, j) => j !== i).reduce((s, o) => s + (o.rosterPts || 0), 0);
        mySide.netStarterSurplus = Math.round((mySide.starterPts - othersStarter) * 10) / 10;
        mySide.netRosterSurplus = Math.round((mySide.rosterPts - othersRoster) * 10) / 10;
      }
    }
  }

  const teamStats = new Map();
  const posKeys = [...POSITIONS, 'Other'];
  const ensureTeam = name => {
    if (!teamStats.has(name)) {
      const posBreakdown = {};
      for (const pos of posKeys) posBreakdown[pos] = { starterPts: 0, rosterPts: 0, count: 0 };
      teamStats.set(name, { manager: name, tradeCount: 0, totalReceivedStarter: 0, totalReceivedRoster: 0, totalGivenStarter: 0, totalGivenRoster: 0, pendingPickCount: 0, posBreakdown });
    }
    return teamStats.get(name);
  };

  for (const trade of processedTrades) {
    for (let i = 0; i < trade.sides.length; i++) {
      const mySide = trade.sides[i];
      const ts = ensureTeam(mySide.manager);
      ts.tradeCount++; ts.totalReceivedStarter += mySide.starterPts || 0; ts.totalReceivedRoster += mySide.rosterPts || 0; ts.pendingPickCount += mySide.pendingPickCount || 0;
      for (let j = 0; j < trade.sides.length; j++) { if (j === i) continue; ts.totalGivenStarter += trade.sides[j].starterPts || 0; ts.totalGivenRoster += trade.sides[j].rosterPts || 0; }
      for (const pd of (mySide.playerDetails || [])) { const pos = POSITIONS.includes(pd.position) ? pd.position : 'Other'; ts.posBreakdown[pos].starterPts += pd.starterPts; ts.posBreakdown[pos].rosterPts += pd.rosterPts; ts.posBreakdown[pos].count++; }
      for (const pd of (mySide.pickDetails || [])) { if (!pd.resolvedPlayerID) continue; const pos = POSITIONS.includes(pd.resolvedPosition) ? pd.resolvedPosition : 'Other'; ts.posBreakdown[pos].starterPts += pd.starterPts; ts.posBreakdown[pos].rosterPts += pd.rosterPts; ts.posBreakdown[pos].count++; }
    }
  }

  const teamSummary = [...teamStats.values()].map(t => ({
    ...t,
    netStarterSurplus: Math.round((t.totalReceivedStarter - t.totalGivenStarter) * 10) / 10,
    netRosterSurplus: Math.round((t.totalReceivedRoster - t.totalGivenRoster) * 10) / 10,
    avgStarterPtsPerTrade: t.tradeCount > 0 ? Math.round((t.totalReceivedStarter / t.tradeCount) * 10) / 10 : 0,
    avgRosterPtsPerTrade: t.tradeCount > 0 ? Math.round((t.totalReceivedRoster / t.tradeCount) * 10) / 10 : 0,
  }));

  return { trades: processedTrades, teamSummary, managers: [...new Set(teamSummary.map(t => t.manager))].sort() };
}
