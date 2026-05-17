import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { leagueID } from '../src/lib/utils/leagueInfo.js';
import {
  buildRookieContracts,
  buildValueIndexes,
  calculateContractValue,
  findRookieContract,
  normalizeName,
  resolvePlayerValue,
  suggestName
} from '../src/lib/utils/playerNameLookup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_VALUES_PATH = path.join(ROOT, 'static', 'Player_Values.txt');
const DEFAULT_MAPPING_PATH = path.join(ROOT, 'static', 'fp_sleeper_mapping.txt');
const REVIEW_DIR = path.join(ROOT, 'data', 'player-values', 'review');
const RAW_DIR = path.join(ROOT, 'data', 'player-values', 'raw');

const COMMANDS = new Set(['prepare', 'generate', 'audit']);

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!COMMANDS.has(command)) {
    printUsage();
    process.exit(1);
  }

  const args = parseArgs(rest);
  const year = Number(args.year);
  if (!Number.isInteger(year)) {
    fail('Missing required --year YYYY.');
  }

  const fantasyProsPath = resolvePath(
    args.fantasypros || path.join(RAW_DIR, `fantasypros-${year}.csv`)
  );

  if (command === 'prepare') {
    await prepare({
      year,
      fantasyProsPath,
      sleeperPath: args.sleeper ? resolvePath(args.sleeper) : null,
      fetchSleeper: Boolean(args['fetch-sleeper'])
    });
    return;
  }

  if (command === 'audit') {
    const exitCode = await audit({
      year,
      leagueId: args['league-id'] || leagueID,
      valuesPath: resolvePath(args.values || DEFAULT_VALUES_PATH),
      mappingPath: resolvePath(args.mapping || DEFAULT_MAPPING_PATH),
      fantasyProsPath: fs.existsSync(fantasyProsPath) ? fantasyProsPath : null,
      sleeperPath: args.sleeper ? resolvePath(args.sleeper) : null,
      fetchSleeper: Boolean(args['fetch-sleeper'])
    });
    process.exit(exitCode);
  }

  generate({
    year,
    fantasyProsPath,
    valuesPath: resolvePath(args.values || DEFAULT_VALUES_PATH),
    outputPath: resolvePath(args.output || DEFAULT_VALUES_PATH),
    rookiesPath: resolvePath(args.rookies || path.join(REVIEW_DIR, `rookies-${year}.csv`))
  });
}

async function prepare({ year, fantasyProsPath, sleeperPath, fetchSleeper }) {
  ensureFile(fantasyProsPath, 'FantasyPros input');

  const defaultSleeperPath = path.join(RAW_DIR, `sleeper-players-${year}.json`);
  if (!sleeperPath && fetchSleeper) {
    sleeperPath = defaultSleeperPath;
    await fetchSleeperPlayers(sleeperPath);
  } else if (!sleeperPath && fs.existsSync(defaultSleeperPath)) {
    sleeperPath = defaultSleeperPath;
  }

  const marketRows = readFantasyProsValues(fantasyProsPath);
  const mappings = readNameMappings(DEFAULT_MAPPING_PATH);
  const indexes = {
    ...buildValueIndexes(marketRows.map((row) => ({ Name: row.Name, MarketValue: row.MarketValue }))),
    sleeperToFantasyPros: mappings.sleeperToFantasyPros
  };
  const candidates = sleeperPath ? readSleeperRookieCandidates(sleeperPath) : [];

  const rows = [];
  const unmatched = [];
  for (const candidate of candidates) {
    const resolved = resolvePlayerValue(candidate.Sleeper, indexes);

    if (resolved.matchType !== 'none' && resolved.matchType !== 'empty') {
      rows.push({
        Fantasy_Pros: resolved.fantasyProsName,
        RookieValue: resolved.value,
        Rookie: 1,
        Source:
          resolved.matchType === 'mapping'
            ? 'sleeper+mapping'
            : resolved.matchType === 'normalized'
              ? 'sleeper+normalized'
              : 'sleeper+exact',
        Sleeper: candidate.Sleeper,
        Notes: ''
      });
      continue;
    }

    const mappedName = mappings.sleeperToFantasyPros.get(candidate.Sleeper) || candidate.Sleeper;
    const suggestion = suggestName(mappedName, marketRows);
    unmatched.push({
      Sleeper: candidate.Sleeper,
      Mapped_Name: mappedName,
      Suggested_Fantasy_Pros: suggestion?.Name || '',
      Suggested_Value: suggestion?.MarketValue ?? '',
      Confidence: suggestion ? suggestion.Score.toFixed(2) : '',
      Notes: 'Review and add to rookies file or fp_sleeper_mapping.txt'
    });
  }

  rows.sort((a, b) => Number(b.RookieValue) - Number(a.RookieValue) || a.Fantasy_Pros.localeCompare(b.Fantasy_Pros));

  const rookiesPath = path.join(REVIEW_DIR, `rookies-${year}.csv`);
  const unmatchedPath = path.join(REVIEW_DIR, `unmatched-rookies-${year}.csv`);

  writeCsv(rookiesPath, rows, ['Fantasy_Pros', 'RookieValue', 'Rookie', 'Source', 'Sleeper', 'Notes']);
  writeCsv(unmatchedPath, unmatched, [
    'Sleeper',
    'Mapped_Name',
    'Suggested_Fantasy_Pros',
    'Suggested_Value',
    'Confidence',
    'Notes'
  ]);

  console.log(`Read ${marketRows.length} FantasyPros market rows.`);
  if (!sleeperPath) {
    console.log('No --sleeper file supplied, so rookie review file has only headers.');
    console.log(`Add rookies manually to ${relative(rookiesPath)} before generate.`);
  } else {
    console.log(`Detected ${rows.length} matched rookie candidates from Sleeper.`);
    console.log(`Wrote ${unmatched.length} unmatched rookie candidates for review.`);
  }
  console.log(`Rookie review: ${relative(rookiesPath)}`);
  console.log(`Unmatched review: ${relative(unmatchedPath)}`);
}

async function audit({
  year,
  leagueId,
  valuesPath,
  mappingPath,
  fantasyProsPath,
  sleeperPath,
  fetchSleeper
}) {
  ensureFile(valuesPath, 'player values');

  const defaultSleeperPath = path.join(RAW_DIR, `sleeper-players-${year}.json`);
  if (!sleeperPath && fetchSleeper) {
    sleeperPath = defaultSleeperPath;
    await fetchSleeperPlayers(sleeperPath);
  } else if (!sleeperPath && fs.existsSync(defaultSleeperPath)) {
    sleeperPath = defaultSleeperPath;
  }

  if (!sleeperPath) {
    fail('Sleeper player data required. Pass --sleeper or --fetch-sleeper.');
  }

  const yearRows = readPlayerValues(valuesPath).filter((row) => row.Year === year);
  if (!yearRows.length) {
    fail(`No player values found for year ${year} in ${relative(valuesPath)}.`);
  }

  const mappings = readNameMappings(mappingPath);
  const indexes = {
    ...buildValueIndexes(yearRows.map((row) => ({ Name: row.Name, Value: row.Value }))),
    sleeperToFantasyPros: mappings.sleeperToFantasyPros
  };

  const suggestRows = fantasyProsPath
    ? readFantasyProsValues(fantasyProsPath).map((row) => ({
        Name: row.Name,
        MarketValue: row.MarketValue
      }))
    : yearRows.map((row) => ({ Name: row.Name, Value: row.Value }));

  const sleeperNames = await readLeagueRosterSleeperNames(leagueId, sleeperPath);
  const flagged = [];

  for (const sleeperName of sleeperNames) {
    const resolved = resolvePlayerValue(sleeperName, indexes);
    const mappedName = mappings.sleeperToFantasyPros.get(sleeperName) || sleeperName;
    const norm = normalizeName(mappedName);
    const notes = [];

    if (indexes.ambiguousNormalized.has(norm)) {
      notes.push('Ambiguous normalized name; add explicit fp_sleeper_mapping.txt row');
    }

    const suggestion =
      resolved.matchType === 'none' ? suggestName(mappedName, suggestRows) : null;
    const suggestedValue = suggestion ? Number(suggestion.Value ?? suggestion.MarketValue ?? 0) : 0;

    const sleeperFirst = mappedName.split(' ')[0]?.toLowerCase();
    const suggestFirst = suggestion?.Name.split(' ')[0]?.toLowerCase();
    const firstNameMatches = sleeperFirst && suggestFirst && sleeperFirst === suggestFirst;

    if (resolved.matchType === 'none' && suggestedValue > 0 && firstNameMatches) {
      flagged.push({
        Sleeper: sleeperName,
        Resolved_Name: resolved.fantasyProsName,
        Value: resolved.value,
        Match_Type: resolved.matchType,
        Suggested_Fantasy_Pros: suggestion?.Name || '',
        Suggested_Value: suggestedValue,
        Confidence: suggestion ? suggestion.Score.toFixed(2) : '',
        Notes: notes.join('; ') || 'Likely missing fp_sleeper_mapping.txt row'
      });
    } else if (notes.length) {
      flagged.push({
        Sleeper: sleeperName,
        Resolved_Name: resolved.fantasyProsName,
        Value: resolved.value,
        Match_Type: resolved.matchType,
        Suggested_Fantasy_Pros: '',
        Suggested_Value: '',
        Confidence: '',
        Notes: notes.join('; ')
      });
    }
  }

  const unmatchedPath = path.join(REVIEW_DIR, `unmatched-roster-${year}.csv`);
  writeCsv(unmatchedPath, flagged, [
    'Sleeper',
    'Resolved_Name',
    'Value',
    'Match_Type',
    'Suggested_Fantasy_Pros',
    'Suggested_Value',
    'Confidence',
    'Notes'
  ]);

  console.log(`Audited ${sleeperNames.length} rostered players for ${year}.`);
  console.log(`Flagged ${flagged.length} issues.`);
  console.log(`Review: ${relative(unmatchedPath)}`);

  if (flagged.length) {
    console.log('\nFlagged players:');
    for (const row of flagged) {
      console.log(`- ${row.Sleeper} (${row.Notes})`);
    }
    return 1;
  }

  return 0;
}

async function readLeagueRosterSleeperNames(leagueId, sleeperPlayersPath) {
  const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
  if (!response.ok) {
    fail(`League roster fetch failed with HTTP ${response.status}.`);
  }

  const rosters = await response.json();
  const players = JSON.parse(fs.readFileSync(sleeperPlayersPath, 'utf8'));
  const names = new Set();

  for (const roster of rosters) {
    for (const playerId of roster.players || []) {
      const player = players[playerId];
      if (!player) continue;
      const name = [player.first_name, player.last_name].filter(Boolean).join(' ').trim();
      if (name) names.add(name);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function generate({ year, fantasyProsPath, valuesPath, outputPath, rookiesPath }) {
  ensureFile(fantasyProsPath, 'FantasyPros input');
  ensureFile(valuesPath, 'historical player values');
  ensureFile(rookiesPath, 'rookie review file');

  const marketRows = readFantasyProsValues(fantasyProsPath);
  const marketByName = new Map(marketRows.map((row) => [row.Name, row.MarketValue]));
  const history = readPlayerValues(valuesPath);
  const rookieRows = readRookieReview(rookiesPath);
  const currentRookies = new Map(rookieRows.map((row) => [row.Fantasy_Pros, row.RookieValue]));
  const rookieContracts = buildRookieContracts(history);
  const existingOtherYears = history.filter((row) => row.Year !== year);

  const generatedRows = [];
  const warnings = [];

  for (const marketRow of marketRows) {
    const currentRookieValue = currentRookies.get(marketRow.Name);
    if (currentRookieValue !== undefined) {
      generatedRows.push({
        Year: year,
        Name: marketRow.Name,
        Value: currentRookieValue,
        Rookie: 1
      });
      continue;
    }

    const contract = findRookieContract(marketRow.Name, rookieContracts);
    if (!contract) {
      generatedRows.push({
        Year: year,
        Name: marketRow.Name,
        Value: marketRow.MarketValue,
        Rookie: 0
      });
      continue;
    }

    const contractYear = year - contract.RookieYear + 1;
    generatedRows.push({
      Year: year,
      Name: marketRow.Name,
      Value: calculateContractValue(contractYear, contract.RookieValue, marketRow.MarketValue),
      Rookie: 0
    });
  }

  for (const [name] of currentRookies) {
    if (!marketByName.has(name)) {
      warnings.push(`Rookie review includes "${name}", but that name was not in FantasyPros input.`);
    }
  }

  const allRows = [...existingOtherYears, ...generatedRows].sort(
    (a, b) => a.Year - b.Year || Number(b.Value) - Number(a.Value) || a.Name.localeCompare(b.Name)
  );

  writeCsv(outputPath, allRows, ['Year', 'Name', 'Value', 'Rookie']);

  const staticMarketPath = path.join(ROOT, 'static', `fantasypros-${year}.csv`);
  fs.copyFileSync(fantasyProsPath, staticMarketPath);
  console.log(`Copied market values for UI: ${relative(staticMarketPath)}`);

  console.log(`Generated ${generatedRows.length} rows for ${year}.`);
  console.log(`Output: ${relative(outputPath)}`);
  if (warnings.length) {
    console.log('\nWarnings:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }
}

function readFantasyProsValues(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text, { skipEmptyLines: true });
  const rows = [];

  for (const columns of parsed.data) {
    if (!Array.isArray(columns) || columns.length < 3) continue;

    const rank = Number(String(columns[0]).trim());
    const displayName = String(columns[1] || '').trim();
    const value = parseDollarValue(columns[2]);

    if (!Number.isFinite(rank) || !displayName || !Number.isFinite(value)) continue;

    rows.push({
      Rank: rank,
      Name: cleanFantasyProsName(displayName),
      MarketValue: value
    });
  }

  if (!rows.length) {
    fail(`Could not parse any FantasyPros rows from ${relative(filePath)}.`);
  }

  return rows;
}

function readPlayerValues(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data
    .filter((row) => row.Year && row.Name)
    .map((row) => ({
      Year: Number(row.Year),
      Name: String(row.Name).trim(),
      Value: Number(row.Value),
      Rookie: Number(row.Rookie) === 1 ? 1 : 0
    }));
}

function readRookieReview(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data
    .filter((row) => Number(row.Rookie) === 1 && row.Fantasy_Pros)
    .map((row) => ({
      Fantasy_Pros: String(row.Fantasy_Pros).trim(),
      RookieValue: Number(row.RookieValue)
    }))
    .filter((row) => Number.isFinite(row.RookieValue));
}

function readNameMappings(filePath) {
  if (!fs.existsSync(filePath)) {
    return { sleeperToFantasyPros: new Map() };
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return {
    sleeperToFantasyPros: new Map(
      parsed.data
        .filter((row) => row.Sleeper && row.Fantasy_Pros)
        .map((row) => [String(row.Sleeper).trim(), String(row.Fantasy_Pros).trim()])
    )
  };
}

function readSleeperRookieCandidates(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const players = Array.isArray(raw) ? raw : Object.values(raw);
  const fantasyPositions = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

  return players
    .filter((player) => player && (!player.sport || player.sport === 'nfl'))
    .filter((player) => {
      const position = player.position || player.fantasy_positions?.[0];
      return (
        player.active === true &&
        fantasyPositions.has(position) &&
        Number(player.years_exp ?? -1) === 0
      );
    })
    .map((player) => ({
      Sleeper: [player.first_name, player.last_name].filter(Boolean).join(' ').trim()
    }))
    .filter((row) => row.Sleeper);
}

async function fetchSleeperPlayers(filePath) {
  console.log('Fetching Sleeper NFL player data...');
  const response = await fetch('https://api.sleeper.app/v1/players/nfl');
  if (!response.ok) {
    fail(`Sleeper player fetch failed with HTTP ${response.status}.`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(await response.json(), null, 2));
  console.log(`Saved Sleeper player data: ${relative(filePath)}`);
}

function cleanFantasyProsName(name) {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function parseDollarValue(value) {
  return Number(String(value).replace(/[$,\s]/g, ''));
}

function writeCsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const csv = rows.length
    ? Papa.unparse(rows, { columns, header: true, newline: '\n' })
    : columns.join(',');
  fs.writeFileSync(filePath, `${csv}\n`);
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const value = args[index + 1] && !args[index + 1].startsWith('--') ? args[++index] : true;
    result[key] = value;
  }
  return result;
}

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found: ${relative(filePath)}`);
  }
}

function relative(filePath) {
  return path.relative(ROOT, filePath) || '.';
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printUsage() {
  console.log(`Usage:
  npm run values:prepare -- --year 2026 --fantasypros data/player-values/raw/fantasypros-2026.csv --sleeper data/player-values/raw/sleeper-players-2026.json
  npm run values:prepare -- --year 2026 --fantasypros data/player-values/raw/fantasypros-2026.csv --fetch-sleeper
  npm run values:generate -- --year 2026 --fantasypros data/player-values/raw/fantasypros-2026.csv
  npm run values:audit -- --year 2026 --fetch-sleeper

Notes:
  prepare writes data/player-values/review/rookies-YYYY.csv for manual review.
  generate replaces that year in static/Player_Values.txt using the reviewed rookie file.
  audit flags rostered players with zero value but a likely FantasyPros match.`);
}

main();
