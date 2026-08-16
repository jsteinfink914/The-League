import { json } from '@sveltejs/kit';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

const ROOT = process.cwd();
const VALUES_PATH = path.join(ROOT, 'static', 'Player_Values.txt');

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: ROOT, timeout: 10_000 }, (error, stdout) => {
      resolve({ ok: !error, output: stdout || '' });
    });
  });
}

function parseValues(csv) {
  const { data } = Papa.parse(csv.trim(), { header: true, skipEmptyLines: true });
  const map = new Map();
  for (const row of data) {
    if (row.Name) map.set(row.Name, { value: Number(row.Value), rookie: Number(row.Rookie) === 1 });
  }
  return map;
}

export async function GET({ url }) {
  const year = Number(url.searchParams.get('year') ?? 2026);

  // Current (working tree) file
  if (!fs.existsSync(VALUES_PATH)) {
    return json({ ok: false, error: 'Player_Values.txt not found.' }, { status: 404 });
  }
  const currentCsv = fs.readFileSync(VALUES_PATH, 'utf8');

  // Committed (HEAD) version
  const headResult = await run('git show HEAD:static/Player_Values.txt');
  if (!headResult.ok || !headResult.output.trim()) {
    return json({ ok: false, error: 'Could not read committed version from git.' }, { status: 500 });
  }

  // Parse both, filter to current year only
  function parseYear(csv, yr) {
    const { data } = Papa.parse(csv.trim(), { header: true, skipEmptyLines: true });
    const map = new Map();
    for (const row of data) {
      if (Number(row.Year) === yr && row.Name) {
        map.set(row.Name, { value: Number(row.Value), rookie: Number(row.Rookie) === 1 });
      }
    }
    return map;
  }

  const current = parseYear(currentCsv, year);
  const committed = parseYear(headResult.output, year);

  const changed = [];
  const added = [];
  const removed = [];

  for (const [name, cur] of current) {
    const com = committed.get(name);
    if (!com) {
      added.push({ name, value: cur.value, rookie: cur.rookie });
    } else if (com.value !== cur.value) {
      changed.push({ name, oldValue: com.value, newValue: cur.value, delta: cur.value - com.value, rookie: cur.rookie });
    }
  }

  for (const [name, com] of committed) {
    if (!current.has(name)) {
      removed.push({ name, value: com.value, rookie: com.rookie });
    }
  }

  // Sort: largest absolute delta first for changed; alpha for added/removed
  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  added.sort((a, b) => b.value - a.value);
  removed.sort((a, b) => b.value - a.value);

  return json({ ok: true, year, changed, added, removed });
}
