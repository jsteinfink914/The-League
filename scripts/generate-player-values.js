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
  const marketRows = fantasyProsPath ? readFantasyProsValues(fantasyProsPath) : [];
  const marketIndexes = fantasyProsPath
    ? {
        ...buildValueIndexes(marketRows.map((row) => ({ Name: row.Name, MarketValue: row.MarketValue }))),
        sleeperToFantasyPros: mappings.sleeperToFantasyPros
      }
    : null;
  const rookieContracts = buildRookieContracts(readPlayerValues(valuesPath));
  const suggestRows = fantasyProsPath
    ? marketRows.map((row) => ({
        Name: row.Name,
        MarketValue: row.MarketValue
      }))
    : yearRows.map((row) => ({ Name: row.Name, Value: row.Value }));

  const sleeperNames = await readLeagueRosterSleeperNames(leagueId, sleeperPath);
  const flagged = [];
  const duplicateRows = duplicatePlayerRows(readPlayerValues(valuesPath), year);

  for (const name of duplicateRows) {
    flagged.push({
      Severity: 'blocking',
      Sleeper: '',
      Resolved_Name: name,
      Value: '',
      Match_Type: 'duplicate',
      Suggested_Fantasy_Pros: '',
      Suggested_Value: '',
      Confidence: '',
      Notes: `Duplicate ${year} player value row; resolve before publishing.`
    });
  }

  for (const sleeperName of sleeperNames) {
    const resolved = resolvePlayerValue(sleeperName, indexes);
    const mappedName = mappings.sleeperToFantasyPros.get(sleeperName) || sleeperName;
    const norm = normalizeName(mappedName);
    const notes = [];
    const contract = findRookieContract(resolved.fantasyProsName, rookieContracts);
    const contractYear = contract ? year - contract.RookieYear + 1 : null;
    const marketResolved = marketIndexes
      ? resolvePlayerValue(sleeperName, marketIndexes)
      : null;
    const marketMissing =
      contractYear >= 3 &&
      (!marketResolved || marketResolved.matchType === 'none' || marketResolved.value == null);
    const assumesZeroMarket = contractYear === 3 && marketMissing;
    const auditResolved = assumesZeroMarket
      ? {
          ...resolved,
          value: calculateContractValue(3, contract.RookieValue, 0),
          matchType: 'rookie_y3_missing_market'
        }
      : resolved;

    if (indexes.ambiguousNormalized.has(norm)) {
      notes.push('Ambiguous normalized name; add explicit fp_sleeper_mapping.txt row');
    }

    const suggestion =
      resolved.matchType === 'none' ? suggestName(mappedName, suggestRows) : null;
    const suggestedValue = suggestion ? Number(suggestion.Value ?? suggestion.MarketValue ?? 0) : 0;

    const sleeperFirst = mappedName.split(' ')[0]?.toLowerCase();
    const suggestFirst = suggestion?.Name.split(' ')[0]?.toLowerCase();
    const firstNameMatches = sleeperFirst && suggestFirst && sleeperFirst === suggestFirst;

    if (marketMissing && !assumesZeroMarket) {
      flagged.push({
        Severity: 'blocking',
        Sleeper: sleeperName,
        Resolved_Name: resolved.fantasyProsName,
        Value: resolved.value,
        Match_Type: marketResolved?.matchType || 'none',
        Suggested_Fantasy_Pros: suggestion?.Name || '',
        Suggested_Value: suggestedValue || '',
        Confidence: suggestion ? suggestion.Score.toFixed(2) : '',
        Notes: [
          `Year ${contractYear} rookie deal has no current FantasyPros market value`,
          ...notes
        ].join('; ')
      });
    } else if (auditResolved.matchType === 'none' || auditResolved.value == null) {
      flagged.push({
        Severity: 'blocking',
        Sleeper: sleeperName,
        Resolved_Name: resolved.fantasyProsName,
        Value: auditResolved.value,
        Match_Type: auditResolved.matchType,
        Suggested_Fantasy_Pros: suggestion?.Name || '',
        Suggested_Value: suggestion ? suggestedValue : '',
        Confidence: suggestion ? suggestion.Score.toFixed(2) : '',
        Notes: notes.join('; ') || 'Missing current player value or explicit fp_sleeper_mapping.txt row'
      });
    } else if (assumesZeroMarket) {
      flagged.push({
        Severity: 'warning',
        Sleeper: sleeperName,
        Resolved_Name: auditResolved.fantasyProsName,
        Value: auditResolved.value,
        Match_Type: auditResolved.matchType,
        Suggested_Fantasy_Pros: '',
        Suggested_Value: '',
        Confidence: '',
        Notes: 'Year 3 player has no current FantasyPros value; assumed $0 for the rookie-value average.'
      });
    } else if (auditResolved.value === 0) {
      flagged.push({
        Severity: 'warning',
        Sleeper: sleeperName,
        Resolved_Name: resolved.fantasyProsName,
        Value: 0,
        Match_Type: auditResolved.matchType,
        Suggested_Fantasy_Pros: '',
        Suggested_Value: '',
        Confidence: '',
        Notes: 'Explicit zero-dollar value (valid, but included for review).'
      });
    } else if (notes.length) {
      flagged.push({
        Severity: 'blocking',
        Sleeper: sleeperName,
        Resolved_Name: resolved.fantasyProsName,
        Value: auditResolved.value,
        Match_Type: auditResolved.matchType,
        Suggested_Fantasy_Pros: '',
        Suggested_Value: '',
        Confidence: '',
        Notes: notes.join('; ')
      });
    }
  }

  const unmatchedPath = path.join(REVIEW_DIR, `unmatched-roster-${year}.csv`);
  writeCsv(unmatchedPath, flagged, [
    'Severity',
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
  const blockingIssues = flagged.filter((row) => row.Severity === 'blocking');
  console.log(`Flagged ${blockingIssues.length} blocking issue(s) and ${flagged.length - blockingIssues.length} warning(s).`);
  console.log(`Review: ${relative(unmatchedPath)}`);

  if (flagged.length) {
    console.log('\nFlagged players:');
    for (const row of flagged) {
      console.log(`- ${row.Sleeper} (${row.Notes})`);
    }
    return blockingIssues.length ? 1 : 0;
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
  const currentYearDuplicates = duplicatePlayerRows(history, year);
  if (currentYearDuplicates.length) {
    fail(`Refusing to replace ${year}: duplicate player value rows already exist for ${currentYearDuplicates.join(', ')}.`);
  }
  const rookieRows = readRookieReview(rookiesPath);
  const currentRookies = new Map(rookieRows.map((row) => [row.Fantasy_Pros, row.RookieValue]));
  const rookieContracts = buildRookieContracts(history);
  const existingOtherYears = history.filter((row) => row.Year !== year);

  const generatedRows = [];
  const issues = [];

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
    const value = calculateContractValue(contractYear, contract.RookieValue, marketRow.MarketValue);
    if (!Number.isFinite(value) || value < 0) {
      issues.push(`${marketRow.Name} has no valid contract value for ${year}.`);
      continue;
    }
    generatedRows.push({
      Year: year,
      Name: marketRow.Name,
      Value: value,
      Rookie: 0
    });
  }

  const generatedNames = new Set(generatedRows.map((row) => normalizeName(row.Name)));
  for (const contract of rookieContracts.byNormalized.values()) {
    const contractYear = year - contract.RookieYear + 1;
    if (contractYear !== 3) continue;

    const normalizedName = normalizeName(contract.rookieName);
    if (generatedNames.has(normalizedName)) continue;

    const value = calculateContractValue(contractYear, contract.RookieValue, 0);
    if (!Number.isFinite(value) || value < 0) {
      issues.push(`${contract.rookieName} has no valid Year 3 fallback value for ${year}.`);
      continue;
    }

    generatedRows.push({
      Year: year,
      Name: contract.rookieName,
      Value: value,
      Rookie: 0
    });
    generatedNames.add(normalizedName);
  }

  for (const [name] of currentRookies) {
    if (!marketByName.has(name)) {
      issues.push(`Rookie review includes "${name}", but that name is not in FantasyPros input.`);
    }
  }

  if (generatedRows.length < marketRows.length || issues.length) {
    fail(`Refusing to generate player values:\n- ${issues.join('\n- ')}`);
  }

  const allRows = [...existingOtherYears, ...generatedRows].sort(
    (a, b) => a.Year - b.Year || Number(b.Value) - Number(a.Value) || a.Name.localeCompare(b.Name)
  );

  const staticMarketPath = path.join(ROOT, 'static', `fantasypros-${year}.csv`);
  writeGeneratedOutputsAtomically({
    valuesPath: outputPath,
    valuesCsv: csvForRows(allRows, ['Year', 'Name', 'Value', 'Rookie']),
    marketPath: staticMarketPath,
    marketCsv: fs.readFileSync(fantasyProsPath, 'utf8')
  });
  console.log(`Copied market values for UI: ${relative(staticMarketPath)}`);

  console.log(`Generated ${generatedRows.length} rows for ${year}.`);
  console.log(`Output: ${relative(outputPath)}`);
}

function readFantasyProsValues(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    fail(`FantasyPros input contains malformed CSV rows: ${relative(filePath)}.`);
  }
  const fields = parsed.meta.fields || [];
  const nameField = fields.find((field) => /^(player|name)$/i.test(String(field).trim())) || fields[1];
  // The FantasyPros export contains both projected Points and auction Value.
  // Always prefer the explicitly named value column so a column-order change
  // cannot silently turn projections into dollar values.
  const valueField = fields.find((field) => /^(value|auction value|\$ value)$/i.test(String(field).trim()));
  const rankField = fields.find((field) => /^(#|rank|overall)$/i.test(String(field).trim())) || fields[0];

  if (!nameField || !valueField) {
    fail(`FantasyPros input must include a player-name column and a Value column: ${relative(filePath)}.`);
  }

  const rows = [];
  const invalidRows = [];

  for (const [index, row] of parsed.data.entries()) {
    const rank = Number(String(row[rankField] ?? '').trim());
    const displayName = String(row[nameField] ?? '').trim();
    const value = parseDollarValue(row[valueField]);

    if (!Number.isFinite(rank) || rank < 1 || !displayName || !Number.isFinite(value) || value < 0) {
      invalidRows.push(index + 2);
      continue;
    }

    rows.push({
      Rank: rank,
      Name: cleanFantasyProsName(displayName),
      MarketValue: value
    });
  }

  if (rows.length < 20) {
    fail(`FantasyPros input has too few valid rows (${rows.length}) in ${relative(filePath)}.`);
  }
  if (invalidRows.length) {
    fail(`FantasyPros input has invalid rank, player name, or non-negative value on row(s): ${invalidRows.join(', ')}.`);
  }

  const duplicateNames = rows
    .map((row) => row.Name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length) {
    fail(`FantasyPros input has duplicate player names after cleanup: ${[...new Set(duplicateNames)].join(', ')}.`);
  }

  return rows;
}

function readPlayerValues(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const rows = [];
  const invalidRows = [];
  for (const [index, row] of parsed.data.entries()) {
    const parsedRow = {
      Year: Number(row.Year),
      Name: String(row.Name ?? '').trim(),
      Value: Number(row.Value),
      Rookie: Number(row.Rookie) === 1 ? 1 : 0
    };
    if (!Number.isInteger(parsedRow.Year) || !parsedRow.Name || !Number.isFinite(parsedRow.Value) || parsedRow.Value < 0) {
      invalidRows.push(index + 2);
    } else {
      rows.push(parsedRow);
    }
  }
  if (parsed.errors.length || invalidRows.length) {
    fail(`Player values input is malformed${invalidRows.length ? ` (rows ${invalidRows.join(', ')})` : ''}.`);
  }
  return rows;
}

function duplicatePlayerRows(rows, year) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    if (row.Year !== year) continue;
    const key = normalizeName(row.Name);
    if (seen.has(key)) duplicates.add(row.Name);
    else seen.add(key);
  }
  return [...duplicates].sort();
}

function readRookieReview(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const rows = [];
  const invalidRows = [];
  const names = new Set();
  for (const [index, row] of parsed.data.entries()) {
    if (Number(row.Rookie) !== 1) continue;
    const name = String(row.Fantasy_Pros ?? '').trim();
    const value = Number(row.RookieValue);
    if (!name || !Number.isFinite(value) || value < 0 || names.has(name)) {
      invalidRows.push(index + 2);
      continue;
    }
    names.add(name);
    rows.push({ Fantasy_Pros: name, RookieValue: value });
  }
  if (parsed.errors.length || invalidRows.length) {
    fail(`Rookie review is malformed or has duplicate names (rows ${invalidRows.join(', ')}).`);
  }
  return rows;
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

  const data = await response.json();
  if (!data || typeof data !== 'object') {
    fail('Sleeper player fetch returned invalid data.');
  }
  writeFileAtomically(filePath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Saved Sleeper player data: ${relative(filePath)}`);
}

function cleanFantasyProsName(name) {
  // FantasyPros appends team/position and, for injured players, a status such
  // as `DTD` immediately after that parenthetical. Neither belongs in the
  // stable player name used by the Sleeper mapping and rookie-contract logic.
  return name.replace(/\s*\([^)]*\)(?:[A-Za-z]+)?\s*$/, '').trim();
}

function parseDollarValue(value) {
  return Number(String(value).replace(/[$,\s]/g, ''));
}

function writeCsv(filePath, rows, columns) {
  writeFileAtomically(filePath, csvForRows(rows, columns));
}

function csvForRows(rows, columns) {
  const csv = rows.length
    ? Papa.unparse(rows, { columns, header: true, newline: '\n' })
    : columns.join(',');
  return `${csv}\n`;
}

function writeFileAtomically(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function writeGeneratedOutputsAtomically({ valuesPath, valuesCsv, marketPath, marketCsv }) {
  const files = [
    { path: valuesPath, content: valuesCsv },
    { path: marketPath, content: marketCsv }
  ].map((file) => ({
    ...file,
    tempPath: `${file.path}.tmp-${process.pid}`,
    backupPath: `${file.path}.bak-${process.pid}`,
    hadOriginal: fs.existsSync(file.path)
  }));

  try {
    for (const file of files) {
      fs.mkdirSync(path.dirname(file.path), { recursive: true });
      fs.writeFileSync(file.tempPath, file.content);
    }
    for (const file of files) {
      if (file.hadOriginal) fs.renameSync(file.path, file.backupPath);
      fs.renameSync(file.tempPath, file.path);
    }
    for (const file of files) fs.rmSync(file.backupPath, { force: true });
  } catch (error) {
    for (const file of files) {
      fs.rmSync(file.tempPath, { force: true });
      if (fs.existsSync(file.backupPath)) {
        fs.rmSync(file.path, { force: true });
        fs.renameSync(file.backupPath, file.path);
      }
    }
    throw error;
  }
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
