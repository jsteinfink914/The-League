import { json } from '@sveltejs/kit';
import { exec } from 'node:child_process';

const ROOT = process.cwd();

function run(cmd, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: ROOT, timeout: timeoutMs, env: process.env }, (error, stdout, stderr) => {
      resolve({
        // audit exits with code 1 when issues are found — that is not an error.
        ok: true,
        exitCode: error?.code ?? 0,
        output: (stdout || '') + (stderr || ''),
        error: error?.killed ? 'Command timed out.' : null
      });
    });
  });
}

const DEV_ONLY = json(
  { ok: false, error: 'Commissioner tools only run in the Replit dev environment, not in production.' },
  { status: 503 }
);

export async function POST({ request }) {
  if (process.env.VERCEL) return DEV_ONLY;

  const body = await request.json().catch(() => ({}));
  const year = Number(body.year ?? 2026);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return json({ ok: false, error: 'Invalid year.' }, { status: 400 });
  }

  const result = await run(
    `node scripts/generate-player-values.js audit --year ${year} --fetch-sleeper`,
    60_000
  );

  return json(result, { status: 200 });
}
