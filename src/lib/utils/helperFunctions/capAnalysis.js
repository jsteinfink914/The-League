import { leagueID } from '$lib/utils/leagueInfo';
import {
  resolvePlayerValue,
  getContractBreakdown,
  normalizeName
} from '$lib/utils/playerNameLookup';

// ── Low-level helpers ──────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.json();
}

/**
 * Walk the league chain starting from leagueID and collect all season IDs.
 * Returns [{year, seasonID, playoffWeekStart}] newest first.
 */
async function collectSeasonChain() {
  const seasons = [];
  let curID = leagueID;

  while (curID && curID !== '0') {
    let data;
    try {
      data = await fetchJson(`https://api.sleeper.app/v1/league/${curID}`);
    } catch (e) {
      console.warn('Cap analysis: failed to fetch league', curID, e);
      break;
    }
    seasons.push({
      year: Number(data.season),
      seasonID: curID,
      playoffWeekStart: data.settings?.playoff_week_start ?? 15,
      status: data.status
    });
    const prev = data.previous_league_id;
    curID = prev && prev !== '0' ? prev : null;
  }

  return seasons;
}

/**
 * Fetch all regular-season matchup weeks for a season in parallel.
 * Returns [{week, entries}]
 */
async function fetchSeasonMatchups(seasonID, playoffWeekStart) {
  const weekCount = Math.max(playoffWeekStart - 1, 1);
  const urls = [];
  for (let w = 1; w <= weekCount; w++) {
    urls.push(`https://api.sleeper.app/v1/league/${seasonID}/matchups/${w}`);
  }

  const responses = await Promise.all(urls.map((u) => fetch(u)));
  const bodies = await Promise.all(responses.map((r) => r.json()));

  return bodies.map((entries, i) => ({
    week: i + 1,
    entries: Array.isArray(entries) ? entries : []
  }));
}

/**
 * Build per-player points map from weekly matchup data.
 * Returns Map<playerID, {starterPts, rosterPts}>
 */
function buildPlayerPoints(weeklyMatchups) {
  const map = new Map();

  const ensure = (pid) => {
    if (!map.has(pid)) map.set(pid, { starterPts: 0, rosterPts: 0 });
    return map.get(pid);
  };

  for (const { entries } of weeklyMatchups) {
    for (const entry of entries) {
      const starters = entry.starters || [];
      const starterPtsArr = entry.starters_points || [];

      // Roster points (all players on the roster that week)
      for (const [pid, pts] of Object.entries(entry.players_points || {})) {
        ensure(pid).rosterPts += pts || 0;
      }
      // Starter points
      starters.forEach((pid, idx) => {
        if (pid) ensure(pid).starterPts += starterPtsArr[idx] || 0;
      });
    }
  }

  return map;
}

/**
 * Build per-roster cumulative weekly points.
 * Returns Map<rosterID, [{week, cumulativeStarter, cumulativeRoster}]>
 */
function buildRosterWeekly(weeklyMatchups) {
  const map = new Map();
  const sorted = [...weeklyMatchups].sort((a, b) => a.week - b.week);

  for (const { week, entries } of sorted) {
    for (const entry of entries) {
      const rid = String(entry.roster_id);
      if (!rid || rid === 'undefined') continue;

      if (!map.has(rid)) map.set(rid, []);
      const arr = map.get(rid);
      const prev = arr.length ? arr[arr.length - 1] : { cumulativeStarter: 0, cumulativeRoster: 0 };

      const weekStarter = entry.points || 0;
      const weekRoster = Object.values(entry.players_points || {}).reduce((s, v) => s + (v || 0), 0);

      arr.push({
        week,
        cumulativeStarter: prev.cumulativeStarter + weekStarter,
        cumulativeRoster: prev.cumulativeRoster + weekRoster
      });
    }
  }

  return map;
}

function buildValueIndexesLocal(rows) {
  const byName = new Map();
  const byNorm = new Map();
  const ambig = new Set();

  for (const row of rows) {
    const name = String(row.Name).trim();
    const value = Number(row.Value ?? 0);
    byName.set(name, { Name: name, Value: value });
    const n = normalizeName(name);
    const ex = byNorm.get(n);
    if (ex && ex.Name !== name) ambig.add(n);
    else if (!ex) byNorm.set(n, { Name: name, Value: value });
  }

  return { valuesByName: byName, valuesByNormalizedName: byNorm, ambiguousNormalized: ambig };
}

function getCapHit({ pid, players, yearIndexes, historyRows, marketValueByName, rookieContracts, year }) {
  const sp = players[pid];
  if (!sp) return { capHit: 0, name: '', position: 'Other', contractLabel: '' };

  const fullName = `${sp.first_name} ${sp.last_name}`;
  const position = sp.fantasy_positions?.[0] || sp.position || 'Other';
  const resolved = resolvePlayerValue(fullName, yearIndexes);
  if (!resolved.value) return { capHit: 0, name: fullName, position, contractLabel: '' };

  const bd = getContractBreakdown({
    fantasyProsName: resolved.fantasyProsName,
    capYear: year,
    capValue: resolved.value,
    historyRows,
    marketValueByName: marketValueByName ?? new Map(),
    rookieContracts
  });

  return { capHit: resolved.value, name: fullName, position, contractLabel: bd.label || '' };
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Build all cap analysis data for the page.
 *
 * @param {Object} opts
 * @param {Array}  opts.preloadedHistory - Pre-computed historical seasonTrends from
 *   static/cap-history.json. When supplied, historical Sleeper matchup API calls are
 *   skipped entirely (only the current season is fetched live).
 *   Pass null to force a full live fetch (e.g. when the JSON hasn't been generated yet).
 */
export async function buildCapAnalysisData({
  historyRows,
  marketValueByName,
  rookieContracts,
  valueIndexes,
  players,
  managerMapRaw,
  valueYear,
  preloadedHistory = null
}) {
  const currentYearNum = Number(valueYear);
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

  // ── Step 1: Collect season chain ──────────────────────────────────────────
  const seasonChain = await collectSeasonChain();

  const capYears = [...new Set(historyRows.map((r) => r.Year))].sort((a, b) => a - b);

  // ── Step 2: Fetch current rosters ─────────────────────────────────────────
  const currentRosters = await fetchJson(`https://api.sleeper.app/v1/league/${leagueID}/rosters`);
  const rosterPlayers = new Map();
  for (const roster of currentRosters) {
    rosterPlayers.set(String(roster.roster_id), roster.players || []);
  }

  // ── Step 3: Cap by position (current rosters, all cap years) ─────────────
  const capByPosition = {};
  const leagueAvgByPosition = {};

  for (const year of capYears) {
    const yearRows = historyRows.filter((r) => r.Year === year);
    const yi = { ...buildValueIndexesLocal(yearRows), sleeperToFantasyPros: valueIndexes.sleeperToFantasyPros };
    const mkt = year === currentYearNum ? marketValueByName : new Map();
    const teamCaps = {};

    for (const [rid, pids] of rosterPlayers) {
      const mn = managerMapRaw.get(rid) || `Team ${rid}`;
      if (!teamCaps[mn]) teamCaps[mn] = { QB: 0, RB: 0, WR: 0, TE: 0, Other: 0, total: 0 };
      for (const pid of pids) {
        const { capHit, position } = getCapHit({ pid, players, yearIndexes: yi, historyRows, marketValueByName: mkt, rookieContracts, year });
        if (!capHit) continue;
        const posKey = POSITIONS.includes(position) ? position : 'Other';
        teamCaps[mn][posKey] += capHit;
        teamCaps[mn].total += capHit;
      }
    }

    capByPosition[year] = teamCaps;

    const totals = { QB: 0, RB: 0, WR: 0, TE: 0, Other: 0 };
    let teamCount = 0;
    for (const tc of Object.values(teamCaps)) {
      if (!tc.total) continue;
      teamCount++;
      for (const pos of [...POSITIONS, 'Other']) totals[pos] += tc[pos] / tc.total;
    }
    leagueAvgByPosition[year] = {};
    for (const pos of [...POSITIONS, 'Other']) {
      leagueAvgByPosition[year][pos] = teamCount ? (totals[pos] / teamCount) * 100 : 0;
    }
  }

  // ── Step 4: Current season matchups ──────────────────────────────────────
  const currentSeason = seasonChain.find((s) => s.year === currentYearNum) || seasonChain[0];
  let currentMatchups = [];
  if (currentSeason) {
    try {
      currentMatchups = await fetchSeasonMatchups(currentSeason.seasonID, currentSeason.playoffWeekStart);
    } catch (e) {
      console.warn('[CapAnalysis] Failed to fetch current matchups:', e);
    }
  }

  const playerPtsCurrent = buildPlayerPoints(currentMatchups);
  const rosterWeeklyCurrent = buildRosterWeekly(currentMatchups);

  // ── Step 5: Player + team efficiency (current year) ───────────────────────
  const currentYearRows = historyRows.filter((r) => r.Year === currentYearNum);
  const currentYI = { ...buildValueIndexesLocal(currentYearRows), sleeperToFantasyPros: valueIndexes.sleeperToFantasyPros };

  const playerEfficiency = [];
  const teamEffMap = new Map();

  for (const [rid, pids] of rosterPlayers) {
    const mn = managerMapRaw.get(rid) || `Team ${rid}`;
    if (!teamEffMap.has(mn)) teamEffMap.set(mn, { capHit: 0, starterPts: 0, rosterPts: 0 });
    const tagg = teamEffMap.get(mn);

    for (const pid of pids) {
      const { capHit, name, position, contractLabel } = getCapHit({
        pid, players, yearIndexes: currentYI, historyRows,
        marketValueByName, rookieContracts, year: currentYearNum
      });
      if (!capHit) continue;

      const pts = playerPtsCurrent.get(pid) || { starterPts: 0, rosterPts: 0 };
      const sp = Math.round(pts.starterPts * 10) / 10;
      const rp = Math.round(pts.rosterPts * 10) / 10;

      playerEfficiency.push({
        playerID: pid, name, position, manager: mn, capHit, contractLabel,
        starterPts: sp, rosterPts: rp,
        dollarPerStarterPt: sp > 0 ? Math.round((capHit / sp) * 100) / 100 : null,
        dollarPerRosterPt: rp > 0 ? Math.round((capHit / rp) * 100) / 100 : null
      });

      tagg.capHit += capHit;
      tagg.starterPts += pts.starterPts;
      tagg.rosterPts += pts.rosterPts;
    }
  }

  const teamEfficiency = [...teamEffMap.entries()].map(([manager, a]) => ({
    manager,
    capHit: a.capHit,
    starterPts: Math.round(a.starterPts * 10) / 10,
    rosterPts: Math.round(a.rosterPts * 10) / 10,
    dollarPerStarterPt: a.starterPts > 0 ? Math.round((a.capHit / a.starterPts) * 100) / 100 : null,
    dollarPerRosterPt: a.rosterPts > 0 ? Math.round((a.capHit / a.rosterPts) * 100) / 100 : null
  }));

  // ── Step 6: Historical season trends ─────────────────────────────────────
  const seasonTrends = [];

  if (preloadedHistory && Array.isArray(preloadedHistory)) {
    // Fast path: use pre-computed data from static/cap-history.json.
    // Only current-year entries need to be computed live (done below).
    for (const entry of preloadedHistory) {
      if (entry.year !== currentYearNum) seasonTrends.push(entry);
    }
  } else {
    // Slow path: fetch all historical seasons live (fallback when JSON not generated yet).
    const historicalSeasons = seasonChain.filter(
      (s) => s.year !== currentYearNum && capYears.includes(s.year)
    );
    const histResults = await Promise.allSettled(
      historicalSeasons.map(async ({ year, seasonID, playoffWeekStart }) => {
        const [matchups, rosters] = await Promise.all([
          fetchSeasonMatchups(seasonID, playoffWeekStart),
          fetchJson(`https://api.sleeper.app/v1/league/${seasonID}/rosters`)
        ]);
        return { year, matchups, rosters };
      })
    );
    for (const result of histResults) {
      if (result.status !== 'fulfilled') continue;
      const { year, matchups, rosters } = result.value;
      const yRows = historyRows.filter((r) => r.Year === year);
      if (!yRows.length) continue;
      const yi = { ...buildValueIndexesLocal(yRows), sleeperToFantasyPros: valueIndexes.sleeperToFantasyPros };
      const playerPts = buildPlayerPoints(matchups);
      const seasonRosterPlayers = new Map();
      for (const roster of rosters) seasonRosterPlayers.set(String(roster.roster_id), roster.players || []);
      const seasonPlayerToRoster = new Map();
      for (const [rid, pids] of seasonRosterPlayers) for (const pid of pids) seasonPlayerToRoster.set(pid, rid);
      const teamAggs = new Map();
      for (const [rid] of seasonRosterPlayers) {
        const mn = managerMapRaw.get(rid) || `Team ${rid}`;
        teamAggs.set(mn, { capHit: 0, starterPts: 0, rosterPts: 0 });
      }
      for (const [pid, pts] of playerPts) {
        const rid = seasonPlayerToRoster.get(pid);
        if (!rid) continue;
        const mn = managerMapRaw.get(rid) || `Team ${rid}`;
        if (!teamAggs.has(mn)) continue;
        const { capHit } = getCapHit({ pid, players, yearIndexes: yi, historyRows, marketValueByName: new Map(), rookieContracts, year });
        if (!capHit) continue;
        const a = teamAggs.get(mn);
        a.capHit += capHit; a.starterPts += pts.starterPts; a.rosterPts += pts.rosterPts;
      }
      for (const [manager, a] of teamAggs) {
        if (!a.capHit) continue;
        const sp = Math.round(a.starterPts * 10) / 10;
        const rp = Math.round(a.rosterPts  * 10) / 10;
        seasonTrends.push({
          year, manager, capHit: a.capHit, starterPts: sp, rosterPts: rp,
          dollarPerStarterPt: sp > 0 ? Math.round((a.capHit / sp) * 100) / 100 : null,
          dollarPerRosterPt:  rp > 0 ? Math.round((a.capHit / rp) * 100) / 100 : null
        });
      }
    }
  }

  // Add current year to trends (always live)
  {
    const year = currentYearNum;
    const yRows = historyRows.filter((r) => r.Year === year);
    if (yRows.length) {
      const yi = { ...buildValueIndexesLocal(yRows), sleeperToFantasyPros: valueIndexes.sleeperToFantasyPros };
      const seasonPlayerToRoster = new Map();
      for (const [rid, pids] of rosterPlayers) for (const pid of pids) seasonPlayerToRoster.set(pid, rid);

      const teamAggs = new Map();
      for (const [rid] of rosterPlayers) {
        const mn = managerMapRaw.get(rid) || `Team ${rid}`;
        teamAggs.set(mn, { capHit: 0, starterPts: 0, rosterPts: 0 });
      }

      for (const [pid, pts] of playerPtsCurrent) {
        const rid = seasonPlayerToRoster.get(pid);
        if (!rid) continue;
        const mn = managerMapRaw.get(rid) || `Team ${rid}`;
        if (!teamAggs.has(mn)) continue;
        const { capHit } = getCapHit({ pid, players, yearIndexes: yi, historyRows, marketValueByName, rookieContracts, year });
        if (!capHit) continue;
        const a = teamAggs.get(mn);
        a.capHit += capHit;
        a.starterPts += pts.starterPts;
        a.rosterPts += pts.rosterPts;
      }

      for (const [manager, a] of teamAggs) {
        if (!a.capHit) continue;
        const sp = Math.round(a.starterPts * 10) / 10;
        const rp = Math.round(a.rosterPts * 10) / 10;
        seasonTrends.push({
          year, manager, capHit: a.capHit, starterPts: sp, rosterPts: rp,
          dollarPerStarterPt: sp > 0 ? Math.round((a.capHit / sp) * 100) / 100 : null,
          dollarPerRosterPt: rp > 0 ? Math.round((a.capHit / rp) * 100) / 100 : null
        });
      }
    }
  }

  // ── Step 7: Weekly trends (current season) ────────────────────────────────
  const weeklyTrends = {};
  for (const [rid, weeklyData] of rosterWeeklyCurrent) {
    const mn = managerMapRaw.get(rid) || `Team ${rid}`;
    const teamCapHit = teamEffMap.get(mn)?.capHit || 0;
    weeklyTrends[mn] = weeklyData.map((w) => ({
      week: w.week,
      cumulativeStarter: Math.round(w.cumulativeStarter * 10) / 10,
      cumulativeRoster: Math.round(w.cumulativeRoster * 10) / 10,
      dollarPerStarterPt: w.cumulativeStarter > 0
        ? Math.round((teamCapHit / w.cumulativeStarter) * 100) / 100 : null,
      dollarPerRosterPt: w.cumulativeRoster > 0
        ? Math.round((teamCapHit / w.cumulativeRoster) * 100) / 100 : null
    }));
  }

  return {
    currentYear: currentYearNum,
    years: capYears,
    capByPosition,
    leagueAvgByPosition,
    teamEfficiency,
    playerEfficiency,
    seasonTrends,
    weeklyTrends
  };
}
