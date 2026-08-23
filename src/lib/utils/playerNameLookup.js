import Papa from 'papaparse';

export function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * @param {{ Name: string, Value?: number, MarketValue?: number }[]} rows
 */
export function buildValueIndexes(rows) {
  const valuesByName = new Map();
  const valuesByNormalizedName = new Map();
  const ambiguousNormalized = new Set();
  const invalidRows = [];
  const duplicateNames = new Set();

  for (const row of rows) {
    const name = String(row.Name).trim();
    const value = Number(row.Value ?? row.MarketValue);
    if (!name || !Number.isFinite(value) || value < 0) {
      invalidRows.push(row);
      continue;
    }
    if (valuesByName.has(name)) {
      duplicateNames.add(name);
      continue;
    }
    valuesByName.set(name, { Name: name, Value: value });

    const norm = normalizeName(name);
    const existing = valuesByNormalizedName.get(norm);
    if (existing && existing.Name !== name) {
      ambiguousNormalized.add(norm);
    } else if (!existing) {
      valuesByNormalizedName.set(norm, { Name: name, Value: value });
    }
  }

  return { valuesByName, valuesByNormalizedName, ambiguousNormalized, invalidRows, duplicateNames };
}

/**
 * @param {string} sleeperName
 * @param {{
 *   sleeperToFantasyPros: Map<string, string>,
 *   valuesByName: Map<string, { Name: string, Value: number }>,
 *   valuesByNormalizedName: Map<string, { Name: string, Value: number }>,
 *   ambiguousNormalized?: Set<string>
 * }} indexes
 */
export function resolvePlayerValue(sleeperName, indexes) {
  if (!sleeperName) {
    return { fantasyProsName: '', value: null, matchType: 'empty' };
  }

  const { sleeperToFantasyPros, valuesByName, valuesByNormalizedName, ambiguousNormalized } =
    indexes;
  const mappedName = sleeperToFantasyPros.get(sleeperName) || sleeperName;
  const usedMapping = sleeperToFantasyPros.has(sleeperName);

  const exact = valuesByName.get(mappedName);
  if (exact) {
    return {
      fantasyProsName: exact.Name,
      value: exact.Value,
      matchType: usedMapping ? 'mapping' : 'exact'
    };
  }

  const norm = normalizeName(mappedName);
  if (!ambiguousNormalized?.has(norm)) {
    const normalized = valuesByNormalizedName.get(norm);
    if (normalized) {
      return {
        fantasyProsName: normalized.Name,
        value: normalized.Value,
        matchType: 'normalized'
      };
    }
  }

  return { fantasyProsName: mappedName, value: null, matchType: 'none' };
}

/**
 * Index league-entry rookie contracts (Rookie === 1) by normalized name so
 * year-to-year Fantasy Pros renames (e.g. Luther Burden → Luther Burden III) stay linked.
 *
 * @param {{ Year: number, Name: string, Value: number, Rookie: number }[]} historyRows
 */
export function buildRookieContracts(historyRows) {
  const byNormalized = new Map();
  const ambiguousNormalized = new Set();

  for (const row of historyRows) {
    if (row.Rookie !== 1) continue;

    const norm = normalizeName(row.Name);
    const existing = byNormalized.get(norm);

    if (!existing) {
      byNormalized.set(norm, {
        RookieYear: row.Year,
        RookieValue: row.Value,
        rookieName: row.Name
      });
      continue;
    }

    if (existing.rookieName !== row.Name) {
      ambiguousNormalized.add(norm);
    }

    if (row.Year < existing.RookieYear) {
      byNormalized.set(norm, {
        RookieYear: row.Year,
        RookieValue: row.Value,
        rookieName: row.Name
      });
    }
  }

  return { byNormalized, ambiguousNormalized };
}

/**
 * @param {string} fantasyProsName
 * @param {ReturnType<typeof buildRookieContracts>} contracts
 */
export function findRookieContract(fantasyProsName, contracts) {
  if (!fantasyProsName) return null;

  const norm = normalizeName(fantasyProsName);
  if (contracts.ambiguousNormalized.has(norm)) return null;

  return contracts.byNormalized.get(norm) ?? null;
}

export function calculateContractValue(contractYear, rookieValue, marketValue) {
  if (!Number.isFinite(rookieValue) || rookieValue < 0) return null;
  if (contractYear <= 2) return rookieValue;
  if (!Number.isFinite(marketValue) || marketValue < 0) return null;
  if (contractYear === 3) return Math.round((rookieValue + marketValue) / 2);
  return marketValue;
}

export const CONTRACT_STATUS_LABELS = {
  none: '',
  unresolved: 'Unresolved value',
  rookie_year: 'Rookie year (Year 1)',
  rookie_y3: 'Rookie deal (Year 3 blend)',
  market: 'Market'
};

function getContractLabel(status, contractYear) {
  if (status === 'rookie_y1_2') {
    return `Rookie deal (Year ${contractYear})`;
  }

  return CONTRACT_STATUS_LABELS[status] ?? '';
}

/**
 * @param {string} csvText Raw FantasyPros export (rank,name,$value per line)
 * @returns {Map<string, number>}
 */
export function parseFantasyProsMarketCsv(csvText) {
  const map = new Map();
  const parsed = Papa.parse(String(csvText), { header: true, skipEmptyLines: true });
  const fields = parsed.meta.fields || [];
  const nameField =
    fields.find((field) => /^(player|name|overall)$/i.test(String(field).trim())) || fields[1];
  const valueField = fields.find((field) =>
    /^(value|auction value|\$ value)$/i.test(String(field).trim())
  );

  // The export also contains a Points column, which may be negative or differ
  // from the auction value. Never fall back to that positional column.
  if (!nameField || !valueField) return map;

  for (const row of parsed.data) {
    const displayName = String(row[nameField] || '').trim();
    const value = Number(String(row[valueField] || '').replace(/[$,\s]/g, ''));
    if (!displayName || !Number.isFinite(value) || value < 0) continue;

    // FantasyPros may append injury status immediately after the team/position,
    // e.g. "Malik Nabers (NYG - WR)DTD". Keep the stable player name only.
    const name = displayName.replace(/\s*\([^)]*\)(?:[A-Za-z]+)?\s*$/, '').trim();
    map.set(name, value);
  }

  return map;
}

function getMarketValue(fantasyProsName, marketValueByName) {
  if (!marketValueByName || !fantasyProsName) return null;

  if (marketValueByName.has(fantasyProsName)) {
    return marketValueByName.get(fantasyProsName);
  }

  const norm = normalizeName(fantasyProsName);
  for (const [name, value] of marketValueByName) {
    if (normalizeName(name) === norm) return value;
  }

  return null;
}

function findCurrentYearRow(fantasyProsName, capYear, historyRows) {
  const capYearNum = Number(capYear);
  const norm = normalizeName(fantasyProsName);

  for (const row of historyRows) {
    if (row.Year !== capYearNum) continue;
    if (normalizeName(row.Name) === norm) return row;
  }

  return null;
}

/**
 * @param {{
 *   fantasyProsName: string,
 *   capYear: number | string,
 *   capValue: number,
 *   historyRows: { Year: number, Name: string, Value: number, Rookie: number }[],
 *   marketValueByName?: Map<string, number>,
 *   rookieContracts?: ReturnType<typeof buildRookieContracts>
 * }} params
 */
export function getContractBreakdown({
  fantasyProsName,
  capYear,
  capValue,
  historyRows,
  marketValueByName,
  rookieContracts
}) {
  const empty = {
    status: 'none',
    label: '',
    formula: '',
    contractYear: null,
    rookieEntryYear: null,
    rookieValue: null,
    marketValue: null
  };

  if (!fantasyProsName) return empty;
  if (!Number.isFinite(capValue) || capValue < 0) {
    return {
      ...empty,
      status: 'unresolved',
      label: getContractLabel('unresolved'),
      formula: 'No valid current-year player value is available.'
    };
  }

  const capYearNum = Number(capYear);
  const contracts = rookieContracts ?? buildRookieContracts(historyRows);
  const currentRow = findCurrentYearRow(fantasyProsName, capYearNum, historyRows);
  const marketValue = getMarketValue(fantasyProsName, marketValueByName);

  if (currentRow?.Rookie === 1) {
    return {
      status: 'rookie_year',
      label: getContractLabel('rookie_year', 1),
      formula: `Rookie year (${capYearNum} entry): $${capValue}`,
      contractYear: 1,
      rookieEntryYear: capYearNum,
      rookieValue: capValue,
      marketValue
    };
  }

  const contract = findRookieContract(fantasyProsName, contracts);
  if (!contract) {
    return {
      status: 'market',
      label: getContractLabel('market'),
      formula: `Market value: $${capValue}`,
      contractYear: null,
      rookieEntryYear: null,
      rookieValue: null,
      marketValue: marketValue ?? capValue
    };
  }

  const contractYear = capYearNum - contract.RookieYear + 1;
  const rookieValue = contract.RookieValue;

  if (contractYear <= 2) {
    return {
      status: 'rookie_y1_2',
      label: getContractLabel('rookie_y1_2', contractYear),
      formula: `Year ${contractYear} rookie deal: $${capValue} (entry ${contract.RookieYear})`,
      contractYear,
      rookieEntryYear: contract.RookieYear,
      rookieValue,
      marketValue
    };
  }

  if (contractYear === 3) {
    if (marketValue != null && Number.isFinite(marketValue) && marketValue >= 0) {
      const blended = calculateContractValue(3, rookieValue, marketValue);
      return {
        status: 'rookie_y3',
        label: getContractLabel('rookie_y3', contractYear),
        formula: `Year 3 blend: ($${rookieValue} + $${marketValue}) / 2 = $${blended}`,
        contractYear,
        rookieEntryYear: contract.RookieYear,
        rookieValue,
        marketValue
      };
    }

    return {
      status: 'unresolved',
      label: getContractLabel('unresolved'),
      formula: `Year 3 blend unavailable: no Fantasy Pros market value (current $${capValue})`,
      contractYear,
      rookieEntryYear: contract.RookieYear,
      rookieValue,
      marketValue: null
    };
  }

  if (marketValue == null || !Number.isFinite(marketValue) || marketValue < 0) {
    return {
      ...empty,
      status: 'unresolved',
      label: getContractLabel('unresolved'),
      formula: `Year ${contractYear} market value is unavailable for ${fantasyProsName}.`,
      contractYear,
      rookieEntryYear: contract.RookieYear,
      rookieValue,
      marketValue: null
    };
  }

  return {
    status: 'market',
    label: getContractLabel('market', contractYear),
    formula: `Year ${contractYear} market value: $${capValue}`,
    contractYear,
    rookieEntryYear: contract.RookieYear,
    rookieValue,
    marketValue
  };
}

export function suggestName(name, rows) {
  const normalizedName = normalizeName(name);
  let best = null;

  for (const row of rows) {
    const rowName = row.Name ?? row.Fantasy_Pros;
    const score = similarity(normalizedName, normalizeName(rowName));
    if (!best || score > best.Score) {
      const value = Number(row.Value ?? row.MarketValue ?? 0);
      best = { Name: rowName, Value: value, MarketValue: value, Score: score };
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
