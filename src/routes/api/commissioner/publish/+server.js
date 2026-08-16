import { json } from '@sveltejs/kit';
import { exec } from 'node:child_process';

const ROOT = process.cwd();

function run(cmd, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: ROOT, timeout: timeoutMs, env: process.env }, (error, stdout, stderr) => {
      resolve({
        ok: !error || error.code === 0,
        exitCode: error?.code ?? 0,
        output: (stdout || '') + (stderr || ''),
        error: error?.message ?? null
      });
    });
  });
}

export async function POST({ request }) {
  const body = await request.json().catch(() => ({}));
  const year = Number(body.year ?? 2026);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return json({ ok: false, error: 'Invalid year.' }, { status: 400 });
  }

  // Stage only the generated value files — not scripts, config, etc.
  const filesToAdd = [
    `static/Player_Values.txt`,
    `static/fantasypros-${year}.csv`,
    `data/player-values/raw/fantasypros-${year}.csv`,
    `data/player-values/raw/sleeper-players-${year}.json`,
    `data/player-values/review/rookies-${year}.csv`,
    `data/player-values/review/unmatched-rookies-${year}.csv`,
    `data/player-values/review/unmatched-roster-${year}.csv`
  ].join(' ');

  const addResult = await run(`git add ${filesToAdd}`, 15_000);
  if (!addResult.ok) {
    return json({ ok: false, output: addResult.output, error: 'git add failed.' }, { status: 500 });
  }

  // Check if there's actually anything to commit.
  const statusResult = await run('git diff --cached --quiet', 10_000);
  if (statusResult.ok) {
    // Exit code 0 means nothing staged — already up to date.
    return json({ ok: true, output: 'Nothing changed since last push — already up to date.', noop: true });
  }

  const date = new Date().toISOString().slice(0, 10);
  const commitResult = await run(`git commit -m "chore: refresh player values ${date}"`, 15_000);
  if (!commitResult.ok) {
    return json({ ok: false, output: commitResult.output, error: 'git commit failed.' }, { status: 500 });
  }

  const pushResult = await run('git push origin master', 30_000);
  return json({
    ok: pushResult.ok,
    output: addResult.output + commitResult.output + pushResult.output,
    error: pushResult.ok ? null : 'git push failed — check that Replit has push access to GitHub.'
  }, { status: pushResult.ok ? 200 : 500 });
}
