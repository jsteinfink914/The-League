import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_VALUES_PATH = path.join(ROOT, 'static', 'Player_Values.txt');
const DEFAULT_MAPPING_PATH = path.join(ROOT, 'static', 'fp_sleeper_mapping.txt');
const REVIEW_DIR = path.join(ROOT, 'data', 'player-values', 'review');
const RAW_DIR = path.join(ROOT, 'data', 'player-values', 'raw');

const COMMANDS = new Set(['prepare', 'generate']);

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
  const marketByName = new Map(marketRows.map((row) => [row.Name, row]));
  const marketByNormalizedName = new Map(marketRows.map((row) => [normalizeName(row.Name), row]));
  const mappings = readNameMappings(DEFAULT_MAPPING_PATH);
  const candidates = sleeperPath ? readSleeperRookieCandidates(sleeperPath, year) : [];

  const rows = [];
  const unmatched = [];
  for (const candidate of candidates) {
    const mappedName = mappings.sleeperToFantasyPros.get(candidate.Sleeper) || candidate.Sleeper;
    const exact = marketByName.get(mappedName);
    const normalized = marketByNormalizedName.get(normalizeName(mappedName));
    const match = exact || normalized;

    if (match) {
      rows.push({
        Fantasy_Pros: match.Name,
        RookieValue: match.MarketValue,
        Rookie: 1,
        Source: exact ? 'sleeper+mapping' : 'sleeper+normalized',
        Sleeper: candidate.Sleeper,
        Notes: ''
      });
      continue;
    }

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

function generate({ year, fantasyProsPath, valuesPath, outputPath, rookiesPath }) {
  ensureFile(fantasyProsPath, 'FantasyPros input');
  ensureFile(valuesPath, 'historical player values');
  ensureFile(rookiesPath, 'rookie review file');

  const marketRows = readFantasyProsValues(fantasyProsPath);
  const marketByName = new Map(marketRows.map((row) => [row.Name, row.MarketValue]));
  const history = readPlayerValues(valuesPath);
  const rookieRows = readRookieReview(rookiesPath);
  const currentRookies = new Map(rookieRows.map((row) => [row.Fantasy_Pros, row.RookieValue]));
  const rookieContracts = getRookieContracts(history);
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

    const contract = rookieContracts.get(marketRow.Name);
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

  console.log(`Generated ${generatedRows.length} rows for ${year}.`);
  console.log(`Output: ${relative(outputPath)}`);
  if (warnings.length) {
    console.log('\nWarnings:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }
}

function calculateContractValue(contractYear, rookieValue, marketValue) {
  if (contractYear <= 2) return rookieValue;
  if (contractYear === 3) return Math.round((rookieValue + marketValue) / 2);
  return marketValue;
}

function getRookieContracts(rows) {
  const contracts = new Map();
  for (const row of rows) {
    if (row.Rookie === 1 && !contracts.has(row.Name)) {
      contracts.set(row.Name, {
        RookieYear: row.Year,
        RookieValue: row.Value
      });
    }
  }
  return contracts;
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

function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function suggestName(name, rows) {
  const normalizedName = normalizeName(name);
  let best = null;

  for (const row of rows) {
    const score = similarity(normalizedName, normalizeName(row.Name));
    if (!best || score > best.Score) {
      best = { ...row, Score: score };
    }
  }

  return best && best.Score >= 0.72 ? best : null;
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function levenshtein(a, b) {
  const costs = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let previous = i - 1;
    costs[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const current = costs[j];
      costs[j] = Math.min(
        costs[j] + 1,
        costs[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous = current;
    }
  }

  return costs[b.length];
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

Notes:
  prepare writes data/player-values/review/rookies-YYYY.csv for manual review.
  generate replaces that year in static/Player_Values.txt using the reviewed rookie file.`);
}

main();
