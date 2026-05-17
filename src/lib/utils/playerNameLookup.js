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

  for (const row of rows) {
    const name = String(row.Name).trim();
    const value = Number(row.Value ?? row.MarketValue ?? 0);
    valuesByName.set(name, { Name: name, Value: value });

    const norm = normalizeName(name);
    const existing = valuesByNormalizedName.get(norm);
    if (existing && existing.Name !== name) {
      ambiguousNormalized.add(norm);
    } else if (!existing) {
      valuesByNormalizedName.set(norm, { Name: name, Value: value });
    }
  }

  return { valuesByName, valuesByNormalizedName, ambiguousNormalized };
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
    return { fantasyProsName: '', value: 0, matchType: 'empty' };
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

  return { fantasyProsName: mappedName, value: 0, matchType: 'none' };
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
