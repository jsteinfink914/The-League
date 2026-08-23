import { json } from '@sveltejs/kit';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

const ROOT = process.cwd();
const VALUES_RELATIVE_PATH = 'static/Player_Values.txt';

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: ROOT, timeout: 10_000 }, (error, stdout) => {
      resolve({ ok: !error, output: stdout || '' });
    });
  });
}

function readWorkingFile(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

async function readCommittedFile(relativePath) {
  const result = await run(`git show HEAD:${relativePath}`);
  return result.ok ? result.output : '';
}

function parseYearValues(csv, year) {
  const { data } = Papa.parse(csv.trim(), { header: true, skipEmptyLines: true });
  const map = new Map();
  for (const row of data) {
    if (Number(row.Year) === year && row.Name) {
      map.set(row.Name, { value: Number(row.Value), rookie: Number(row.Rookie) === 1 });
    }
  }
  return map;
}

function parseRookies(csv) {
  const { data } = Papa.parse(csv.trim(), { header: true, skipEmptyLines: true });
  const map = new Map();
  for (const row of data) {
    if (row.Fantasy_Pros) {
      map.set(row.Fantasy_Pros, {
        value: Number(row.RookieValue),
        sleeper: row.Sleeper || ''
      });
    }
  }
  return map;
}

function compareValues(current, committed) {
  const changed = [];
  const added = [];
  const removed = [];

  for (const [name, cur] of current) {
    const old = committed.get(name);
    if (!old) {
      added.push({ name, value: cur.value, rookie: cur.rookie });
    } else if (old.value !== cur.value) {
      changed.push({
        name,
        oldValue: old.value,
        newValue: cur.value,
        delta: cur.value - old.value,
        rookie: cur.rookie
      });
    }
  }

  for (const [name, old] of committed) {
    if (!current.has(name)) removed.push({ name, value: old.value, rookie: old.rookie });
  }

  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  added.sort((a, b) => b.value - a.value);
  removed.sort((a, b) => b.value - a.value);
  return { changed, added, removed };
}

function compareRookies(current, committed) {
  const changed = [];
  const added = [];
  const removed = [];

  for (const [name, cur] of current) {
    const old = committed.get(name);
    if (!old) {
      added.push({ name, value: cur.value, sleeper: cur.sleeper });
    } else if (old.value !== cur.value) {
      changed.push({
        name,
        oldValue: old.value,
        newValue: cur.value,
        delta: cur.value - old.value,
        sleeper: cur.sleeper
      });
    }
  }

  for (const [name, old] of committed) {
    if (!current.has(name)) removed.push({ name, value: old.value, sleeper: old.sleeper });
  }

  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  added.sort((a, b) => b.value - a.value);
  removed.sort((a, b) => b.value - a.value);
  return { changed, added, removed };
}

export async function GET({ url }) {
  const year = Number(url.searchParams.get('year') ?? 2026);

  const currentValuesCsv = readWorkingFile(VALUES_RELATIVE_PATH);
  const committedValuesCsv = await readCommittedFile(VALUES_RELATIVE_PATH);
  const currentRookiesCsv = readWorkingFile(`data/player-values/review/rookies-${year}.csv`);
  const committedRookiesCsv = await readCommittedFile(
    `data/player-values/review/rookies-${year}.csv`
  );

  if (!committedValuesCsv.trim() && !committedRookiesCsv.trim()) {
    return json({ ok: false, error: 'Could not read committed version from git.' }, { status: 500 });
  }

  return json({
    ok: true,
    year,
    values: compareValues(
      parseYearValues(currentValuesCsv, year),
      parseYearValues(committedValuesCsv, year)
    ),
    rookies: compareRookies(parseRookies(currentRookiesCsv), parseRookies(committedRookiesCsv))
  });
}
