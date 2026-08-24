import fs from 'node:fs';
import Papa from 'papaparse';
import { normalizeName } from '../src/lib/utils/playerNameLookup.js';

export function readSupplementalRows(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const fields = parsed.meta.fields || [];
  const nameField = fields.find((field) => /^(overall|player|name)$/i.test(String(field).trim()));
  const valueField = fields.find((field) => /^(value|auction value|\$ value)$/i.test(String(field).trim()));
  const pointsField = fields.find((field) => /^points$/i.test(String(field).trim()));
  const rankField = fields.find((field) => /^(#|rank)$/i.test(String(field).trim()));

  if (!nameField || !valueField) {
    throw new Error(
      `FantasyPros supplemental input must include an Overall column and a Value column: ${filePath}.`
    );
  }

  const rows = [];
  const invalidRows = [];
  const names = new Set();

  for (const [index, row] of parsed.data.entries()) {
    const displayName = String(row[nameField] ?? '').trim();
    const value = parseDollarValue(row[valueField]);
    const nameKey = sourceNameKey(displayName);

    if (!displayName || value !== 0 || names.has(nameKey)) {
      invalidRows.push(index + 2);
      continue;
    }

    names.add(nameKey);
    rows.push({
      '#': Number(row[rankField]) || 0,
      Overall: displayName,
      Points: String(row[pointsField] ?? '').trim(),
      Value: '$0'
    });
  }

  if (parsed.errors.length || invalidRows.length) {
    throw new Error(
      `FantasyPros supplemental input is malformed, non-zero, or has duplicate names` +
        ` (rows ${invalidRows.join(', ')}): ${filePath}.`
    );
  }

  return rows;
}

export function mergeSupplementalRows(rows, supplementalRows) {
  const merged = [...rows];
  const names = new Set(rows.map((row) => sourceNameKey(row.Overall)));
  let nextRank = Math.max(0, ...rows.map((row) => Number(row['#']) || 0));

  for (const supplementalRow of supplementalRows) {
    const nameKey = sourceNameKey(supplementalRow.Overall);
    if (names.has(nameKey)) continue;

    merged.push({
      ...supplementalRow,
      '#': ++nextRank
    });
    names.add(nameKey);
  }

  return merged;
}

export function sourceNameKey(displayName) {
  return normalizeName(cleanFantasyProsName(displayName));
}

export function cleanFantasyProsName(name) {
  return String(name)
    .replace(/\s*\([^)]*\)(?:[A-Za-z]+)?\s*$/, '')
    .trim();
}

function parseDollarValue(value) {
  return Number(String(value).replace(/[$,\s]/g, ''));
}