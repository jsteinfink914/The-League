import { json } from '@sveltejs/kit';
import { exec } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();

function run(cmd, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const child = exec(
      cmd,
      {
        cwd: ROOT,
        timeout: timeoutMs,
        env: {
          ...process.env,
          // Ensure playwright finds the project-local browser cache.
          PLAYWRIGHT_BROWSERS_PATH: path.join(ROOT, '.cache', 'ms-playwright')
        }
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error || error.code === 0,
          exitCode: error?.code ?? 0,
          output: (stdout || '') + (stderr || ''),
          error: error?.message ?? null
        });
      }
    );
    // Collect output even if it times out.
    let out = '';
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { out += d; });
  });
}

export async function POST({ request }) {
  const body = await request.json().catch(() => ({}));
  const year = Number(body.year ?? 2026);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return json({ ok: false, error: 'Invalid year.' }, { status: 400 });
  }

  // Step A: pull fresh auction values from FantasyPros
  const fetchResult = await run(
    `node scripts/fetch-fantasypros-values.js --year ${year}`,
    120_000
  );

  if (!fetchResult.ok) {
    return json(fetchResult, { status: 500 });
  }

  // Step B: rebuild rookie review file from current Sleeper rosters
  const prepareResult = await run(
    `node scripts/generate-player-values.js prepare --year ${year} --fetch-sleeper`,
    60_000
  );

  return json({
    ok: prepareResult.ok,
    output: fetchResult.output + '\n\n--- Rookie review rebuild ---\n' + prepareResult.output,
    error: prepareResult.ok ? null : prepareResult.error
  }, { status: prepareResult.ok ? 200 : 500 });
}
