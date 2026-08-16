import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

const ROOT = process.cwd();
const REVIEW_DIR = path.join(ROOT, 'data', 'player-values', 'review');

export async function PUT({ request }) {
  const body = await request.json().catch(() => null);
  if (!body?.year || !Array.isArray(body.rows)) {
    return json({ ok: false, error: 'Missing year or rows.' }, { status: 400 });
  }

  const year = Number(body.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return json({ ok: false, error: 'Invalid year.' }, { status: 400 });
  }

  const rookiesPath = path.join(REVIEW_DIR, `rookies-${year}.csv`);
  if (!fs.existsSync(rookiesPath)) {
    return json({ ok: false, error: `Rookies file not found for ${year}.` }, { status: 404 });
  }

  // Read the existing file to preserve non-rookie rows.
  const existing = fs.readFileSync(rookiesPath, 'utf8');
  const parsed = Papa.parse(existing, { header: true, skipEmptyLines: true });
  const nonRookies = parsed.data.filter((r) => Number(r.Rookie) !== 1);

  // Merge: validated rookie rows from the request + non-rookie rows.
  const updated = body.rows
    .filter((r) => r.Fantasy_Pros && Number.isFinite(Number(r.RookieValue)))
    .map((r) => ({
      Fantasy_Pros: String(r.Fantasy_Pros).trim(),
      RookieValue: Number(r.RookieValue),
      Rookie: 1,
      Source: String(r.Source ?? '').trim(),
      Sleeper: String(r.Sleeper ?? '').trim(),
      Notes: String(r.Notes ?? '').trim()
    }));

  const allRows = [...nonRookies, ...updated];
  const csv = Papa.unparse(allRows, {
    columns: ['Fantasy_Pros', 'RookieValue', 'Rookie', 'Source', 'Sleeper', 'Notes'],
    header: true,
    newline: '\n'
  });

  fs.writeFileSync(rookiesPath, `${csv}\n`);
  return json({ ok: true, saved: updated.length });
}
