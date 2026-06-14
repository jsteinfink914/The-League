/**
 * generate-cap-history.js
 *
 * Pre-computes cap efficiency data for all completed (non-current) seasons
 * and writes it to static/cap-history.json.
 *
 * Run with:  npm run gen-cap-history
 *
 * Re-run any time a season ends, or when Player_Values.txt is updated.
 * The current season is always fetched live by the page — only past seasons
 * are stored here.
 */

import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { leagueID } from '../src/lib/utils/leagueInfo.js';
import {
  normalizeName,
  buildValueIndexes,
  buildRookieContracts,
  resolvePlayerValue,
  getContractBreakdown
} from '../src/lib/utils/playerNameLookup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(__dirname, '../static');
const OUT_FILE  = join(STATIC_DIR, 'cap-history.json');

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.json();
}

function normName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function buildLocalValueIndexes(rows) {
  const byName = new Map();
  const byNorm = new Map();
  const ambig  = new Set();
  for (const row of rows) {
    const name  = String(row.Name).trim();
    const value = Number(row.Value ?? 0);
    byName.set(name, { Name: name, Value: value });
    const n  = normName(name);
    const ex = byNorm.get(n);
    if (ex && ex.Name !== name) ambig.add(n);
    else if (!ex) byNorm.set(n, { Name: name, Value: value });
  }
  return { valuesByName: byName, valuesByNormalizedName: byNorm, ambiguousNormalized: ambig };
}

async function collectSeasonChain() {
  const seasons = [];
  let curID = leagueID;
  while (curID && curID !== '0') {
    let data;
    try { data = await fetchJson(`https://api.sleeper.app/v1/league/${curID}`); }
    catch (e) { console.warn('Failed to fetch league', curID, e.message); break; }
    seasons.push({
      year:             Number(data.season),
      seasonID:         curID,
      playoffWeekStart: data.settings?.playoff_week_start ?? 15,
      status:           data.status
    });
    const prev = data.previous_league_id;
    curID = prev && prev !== '0' ? prev : null;
  }
  return seasons;
}

async function fetchSeasonMatchups(seasonID, playoffWeekStart) {
  const weekCount = Math.max(playoffWeekStart - 1, 1);
  const urls = Array.from({ length: weekCount }, (_, i) =>
    `https://api.sleeper.app/v1/league/${seasonID}/matchups/${i + 1}`
  );
  const responses = await Promise.all(urls.map((u) => fetch(u)));
  const bodies    = await Promise.all(responses.map((r) => r.json()));
  return bodies.map((entries, i) => ({
    week:    i + 1,
    entries: Array.isArray(entries) ? entries : []
  }));
}

function buildPlayerPoints(weeklyMatchups) {
  const map = new Map();
  const ensure = (pid) => {
    if (!map.has(pid)) map.set(pid, { starterPts: 0, rosterPts: 0 });
    return map.get(pid);
  };
  for (const { entries } of weeklyMatchups) {
    for (const entry of entries) {
      const starters      = entry.starters        || [];
      const starterPtsArr = entry.starters_points || [];
      for (const [pid, pts] of Object.entries(entry.players_points || {})) {
        ensure(pid).rosterPts += pts || 0;
      }
      starters.forEach((pid, idx) => {
        if (pid) ensure(pid).starterPts += starterPtsArr[idx] || 0;
      });
    }
  }
  return map;
}

const POS_SET = new Set(['QB', 'RB', 'WR', 'TE']);

function getCapHit({ pid, nflPlayers, yearIndexes, historyRows, rookieContracts, year }) {
  const sp = nflPlayers[pid];
  if (!sp) return { capHit: 0 };

  const fullName = `${sp.first_name} ${sp.last_name}`;
  const resolved = resolvePlayerValue(fullName, yearIndexes);
  if (!resolved.value) return { capHit: 0 };

  const position = POS_SET.has(sp.position) ? sp.position : 'Other';
  return { capHit: resolved.value, name: fullName, position };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Cap History Generator ===\n');

  // Load static data files
  const [playerValuesText, managerMapText, fpMappingText, nflPlayersRaw] = await Promise.all([
    readFile(join(STATIC_DIR, 'Player_Values.txt'),      'utf8'),
    readFile(join(STATIC_DIR, 'Manager_map.txt'),        'utf8'),
    readFile(join(STATIC_DIR, 'fp_sleeper_mapping.txt'), 'utf8'),
    fetchJson('https://api.sleeper.app/v1/players/nfl')
  ]);

  const sleeperToFantasyPros = new Map(
    Papa.parse(fpMappingText, { header: true }).data
      .filter((e) => e.Sleeper && e.Fantasy_Pros)
      .map((e) => [e.Sleeper, e.Fantasy_Pros])
  );

  const historyRows = Papa.parse(playerValuesText, { header: true, skipEmptyLines: true }).data
    .filter((e) => e.Year && e.Name)
    .map((e) => ({
      Year:   Number(e.Year),
      Name:   String(e.Name).trim(),
      Value:  parseFloat(e.Value)  || 0,
      Rookie: Number(e.Rookie) === 1 ? 1 : 0
    }));

  const managerMapRaw = new Map(
    Papa.parse(managerMapText, { header: true }).data.map((e) => [e.Index, e.Name])
  );

  const rookieContracts = buildRookieContracts(historyRows);

  // Walk the season chain
  console.log('Collecting season chain…');
  const seasonChain = await collectSeasonChain();
  const currentYear = seasonChain[0].year; // newest season
  console.log(`Current season: ${currentYear}`);
  console.log(`All seasons found: ${seasonChain.map((s) => s.year).join(', ')}\n`);

  const historicalSeasons = seasonChain.filter((s) => s.year < currentYear);

  if (!historicalSeasons.length) {
    console.log('No historical seasons found — nothing to generate.');
    return;
  }

  // Fetch all historical seasons in parallel
  console.log(`Fetching ${historicalSeasons.length} historical season(s) in parallel…`);
  const results = await Promise.allSettled(
    historicalSeasons.map(async ({ year, seasonID, playoffWeekStart }) => {
      process.stdout.write(`  • ${year} (${seasonID})… `);
      const [matchups, rosters] = await Promise.all([
        fetchSeasonMatchups(seasonID, playoffWeekStart),
        fetchJson(`https://api.sleeper.app/v1/league/${seasonID}/rosters`)
      ]);
      process.stdout.write(`${matchups.length} weeks, ${rosters.length} rosters ✓\n`);
      return { year, matchups, rosters };
    })
  );

  // Compute season trends + player history for each historical season
  const seasonTrends = [];
  const playerHistory = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') {
      console.warn('  ✗ A season fetch failed:', result.reason?.message);
      continue;
    }
    const { year, matchups, rosters } = result.value;

    const yRows = historyRows.filter((r) => r.Year === year);
    if (!yRows.length) {
      console.warn(`  ✗ No Player_Values rows for ${year}, skipping.`);
      continue;
    }

    const yi = { ...buildLocalValueIndexes(yRows), sleeperToFantasyPros };
    const playerPts = buildPlayerPoints(matchups);

    const rosterPlayersMap = new Map(
      rosters.map((r) => [String(r.roster_id), r.players || []])
    );
    const playerToRoster = new Map();
    for (const [rid, pids] of rosterPlayersMap) {
      for (const pid of pids) playerToRoster.set(pid, rid);
    }

    const teamAggs = new Map();
    for (const [rid] of rosterPlayersMap) {
      const mn = managerMapRaw.get(rid) || `Team ${rid}`;
      teamAggs.set(mn, { capHit: 0, starterPts: 0, rosterPts: 0 });
    }

    for (const [pid, pts] of playerPts) {
      const rid = playerToRoster.get(pid);
      if (!rid) continue;
      const mn = managerMapRaw.get(rid) || `Team ${rid}`;
      if (!teamAggs.has(mn)) continue;

      const { capHit, name, position } = getCapHit({ pid, nflPlayers: nflPlayersRaw, yearIndexes: yi, historyRows, rookieContracts, year });
      if (!capHit) continue;

      const a = teamAggs.get(mn);
      a.capHit     += capHit;
      a.starterPts += pts.starterPts;
      a.rosterPts  += pts.rosterPts;

      const sp = Math.round(pts.starterPts * 10) / 10;
      const rp = Math.round(pts.rosterPts  * 10) / 10;
      playerHistory.push({
        year, manager: mn, name, position, capHit,
        starterPts: sp,
        rosterPts:  rp,
        dollarPerStarterPt: sp > 0 ? Math.round((capHit / sp) * 100) / 100 : null,
        dollarPerRosterPt:  rp > 0 ? Math.round((capHit / rp) * 100) / 100 : null
      });
    }

    let pushed = 0;
    for (const [manager, a] of teamAggs) {
      if (!a.capHit) continue;
      const sp = Math.round(a.starterPts * 10) / 10;
      const rp = Math.round(a.rosterPts  * 10) / 10;
      seasonTrends.push({
        year, manager, capHit: a.capHit,
        starterPts:         sp,
        rosterPts:          rp,
        dollarPerStarterPt: sp > 0 ? Math.round((a.capHit / sp) * 100) / 100 : null,
        dollarPerRosterPt:  rp > 0 ? Math.round((a.capHit / rp) * 100) / 100 : null
      });
      pushed++;
    }
    console.log(`  → ${year}: ${pushed} team entries, ${playerHistory.filter(p => p.year === year).length} player entries written`);
  }

  // Write output
  const output = {
    generatedAt:   new Date().toISOString(),
    currentYear,
    note: 'Historical seasons only. Current season is always fetched live.',
    seasonTrends,
    playerHistory
  };

  await writeFile(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Written to static/cap-history.json`);
  console.log(`   ${seasonTrends.length} team-season entries, ${playerHistory.length} player entries across ${historicalSeasons.length} season(s)`);
}

main().catch((err) => {
  console.error('\n❌ Generator failed:', err);
  process.exit(1);
});
