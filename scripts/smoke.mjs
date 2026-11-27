// Pre-push smoke check. Run before pushing anything that touches data,
// routes, sorting, or styles:  npm run smoke
//
// Steps: unit tests -> manager-name check -> hardcoded-hex guard ->
// raw-players-fetch guard -> player-shape guard -> production build ->
// preview sweep of every
// route plus the deep links, ending with headless render checks on the
// money pages (team_values, calculator, cap)
// that carry filters in the URL (the class of page that broke on direct
// load when a param was read before its data existed).
// A passing production build alone is NOT verification — it never executes
// the data helpers. This sweep is the cheap half of the check; the other
// half is opening the live site after the push and clicking the sorts.
import { execFileSync, spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const t0 = Date.now();
const step = (name, fn) => {
    const t = Date.now();
    try {
        fn();
        console.log(`✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    } catch (e) {
        console.error(`✗ ${name} FAILED`);
        if (e.stdout) process.stdout.write(e.stdout);
        if (e.stderr) process.stderr.write(e.stderr);
        process.exit(1);
    }
};
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' });

// --- hardcoded hex guard -------------------------------------------------
// Pages must use the site's theme variables (--g555, --ddd, --f3f3f3, ...),
// which flip with the SMUI dark theme. Raw neutral hexes in a <style> block
// are how dark mode keeps breaking. Fallbacks inside var(--x, #hex) are
// fine; chart palettes and semantic colors (position/status/accent) are
// allowlisted.
const SEMANTIC = new Set(['#fff', '#3498db', '#e74c3c', '#c0392b', '#27ae60', '#2ecc71',
    '#9a7000', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a',
    '#ff5722', '#607d8b', '#795548', '#ffc107', '#673ab7', '#34495e', '#2980b9', '#c1121f',
    '#95a5a6', '#2471a3', '#2e86c1', '#5dade2', '#ff0000']);
const GUARDED = [
    'src/lib/H2H/H2H.svelte', 'src/lib/ManagerOverview/ManagerOverview.svelte',
    'src/lib/TradeAnalysis/TradeAnalysis.svelte', 'src/lib/DraftAnalysis/DraftAnalysis.svelte',
    'src/lib/CapAnalysis/CapAnalysis.svelte', 'src/lib/Standings/index.svelte',
    'src/routes/cap/+page.svelte', 'src/routes/team_values/+page.svelte',
    'src/lib/ask/Ask.svelte',
];
const hexGuard = () => {
    const offenders = [];
    for (const file of GUARDED) {
        const s = readFileSync(file, 'utf8');
        const style = (s.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
        const noFallbacks = style.replace(/var\([^)]*\)/g, 'var()');
        for (const hx of noFallbacks.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []) {
            if (!SEMANTIC.has(hx.toLowerCase())) offenders.push(`${file}: ${hx}`);
        }
    }
    if (offenders.length) throw new Error('raw hex colors in styles (use theme vars):\n' + offenders.join('\n'));
};

// --- raw players fetch guard ----------------------------------------------
// The ~5MB Sleeper player file must come through the shared cached loader
// (loadPlayers, backed by /api/fetch_players_info) — pages that fetched it
// raw on every mount were the site's worst latency offenders. Only the
// allowlisted files may call the raw endpoint: the API route itself (it
// IS the loader's source), Manager Overview's shared loader (it also runs
// server-side for Ask, where the browser loader can't), and Trade
// Analysis (its builder needs the raw record shape, not the computed
// map). A line counts only if it actually fetches — comments that merely
// mention the URL are fine.
const PLAYERS_ALLOWLIST = new Set([
    'src/routes/api/fetch_players_info/+server.js',
    'src/lib/utils/helperFunctions/managerOverviewData.js',
    'src/lib/TradeAnalysis/TradeAnalysis.svelte',
]);
const playersGuard = () => {
    const offenders = [];
    const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(js|svelte)$/.test(e.name) && !PLAYERS_ALLOWLIST.has(p)) {
                const lines = readFileSync(p, 'utf8').split('\n');
                lines.forEach((line, i) => {
                    if (line.includes('api.sleeper.app/v1/players/nfl') && /fetch/.test(line)) {
                        offenders.push(`${p}:${i + 1}`);
                    }
                });
            }
        }
    };
    walk('src');
    if (offenders.length) throw new Error('raw players/nfl fetch outside the shared loader (use loadPlayers):\n' + offenders.join('\n'));
};

// --- player shape guard -----------------------------------------------------
// loadPlayers returns the computed /api/fetch_players_info records, whose
// name fields are fn/ln — NOT the raw Sleeper file's first_name/last_name.
// When Team Values and the Calculator moved to the shared loader in the
// Nov 2026 latency pass, they kept reading first_name/last_name and
// silently built "undefined undefined" for every rostered player (Team
// Values showed every team at $0; no error anywhere). Any file that uses
// loadPlayers and references the raw field names fails here.
const playerShapeGuard = () => {
    const offenders = [];
    const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(js|svelte)$/.test(e.name)) {
                const text = readFileSync(p, 'utf8');
                if (!text.includes('loadPlayers')) continue;
                text.split('\n').forEach((line, i) => {
                    if (/\.first_name|\.last_name/.test(line)) offenders.push(`${p}:${i + 1}`);
                });
            }
        }
    };
    walk('src');
    if (offenders.length) throw new Error('loadPlayers consumer reads raw first_name/last_name fields (the loader returns fn/ln):\n' + offenders.join('\n'));
};

// --- route sweep -----------------------------------------------------------
const discoverRoutes = (dir, base = '') => {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            if (e.name.startsWith('(') || e.name.startsWith('[')) continue;
            out.push(...discoverRoutes(join(dir, e.name), `${base}/${e.name}`));
        }
    }
    try {
        readdirSync(dir).includes('+page.svelte') && out.push(base || '/');
    } catch { /* not a route dir */ }
    return out;
};
const DEEP_LINKS = [
    '/team_values?manager=Oscar',
    '/h2h/luck?sort=wins&dir=desc',
    '/h2h/anatomy?season=2026&team=5',
    '/cap?year=2025',
    '/trade_analysis/log?manager=Oscar',
    '/manager_overview/cards?manager=Oscar',
];
// --- render checks ----------------------------------------------------------
// The route sweep only proves each page returns HTTP 200 — but the money
// pages load their data in the browser, and a page can render complete
// garbage with a 200 (Nov 27, 2026: Team Values showed every team at $0
// for two days after a data-source swap changed the player record shape;
// no error was ever thrown). These checks drive the built pages in a
// headless browser and assert on the RENDERED numbers: no "undefined"
// anywhere, Team Values totals real money, Calculator roster chips are
// real player names, and the Cap table carries real values. Fail-closed:
// if the browser is missing, this step fails with the install command.
// Transport note: pages fetch Sleeper directly from the browser, and a
// sandboxed Chromium may be unable to use the host's egress proxy, so
// api.sleeper.app requests are fulfilled through Node's fetch (same live
// responses, byte for byte) — the page code, rendering, and math under
// test are entirely real; only that one API's transport is bridged.
const renderChecks = async (base) => {
    let chromium;
    try {
        ({ chromium } = await import('playwright'));
    } catch (e) {
        throw new Error('render checks: playwright is not installed — ' + e.message);
    }
    let browser;
    try {
        browser = await chromium.launch();
    } catch (e) {
        throw new Error('render checks: headless Chromium unavailable — run `npx playwright install chromium` once. ' + String(e.message).split('\n')[0]);
    }
    const failures = [];
    const check = (label, cond, detail) => { if (!cond) failures.push(`${label}: ${detail}`); };
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(60000);
        await page.route('https://api.sleeper.app/**', async (route) => {
            try {
                const res = await fetch(route.request().url());
                const body = Buffer.from(await res.arrayBuffer());
                await route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' }, body });
            } catch {
                await route.abort();
            }
        });

        // Each page runs in its own section so one page's load timeout
        // records a failure instead of masking the other pages' results.
        const section = async (label, fn) => {
            try { await fn(); } catch (e) { failures.push(`${label}: did not finish loading — ${String(e.message).split('\n')[0]}`); }
        };

        // Team Values (deep link preselects Oscar — the over-cap team).
        await section('team_values', async () => {
            await page.goto(base + '/team_values?manager=Oscar', { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.querySelectorAll('.dropdown-container table tbody tr').length >= 20, null, { timeout: 60000 });
            const tv = await page.evaluate(() => {
                const totalCell = document.querySelector('.dropdown-container tr.total-value td:nth-child(2)');
                return {
                    total: totalCell ? totalCell.textContent.trim() : null,
                    hasUndefined: document.body.innerText.includes('undefined'),
                    hasError: !!document.querySelector('.status-err'),
                };
            });
            check('team_values', !tv.hasError, 'page shows a load error');
            check('team_values', !tv.hasUndefined, 'rendered output contains "undefined"');
            check('team_values', tv.total !== null && parseFloat(tv.total.replace(/[^0-9.]/g, '')) > 0, `team total is ${tv.total} (expected > $0)`);
        });

        // Calculator roster quick-add chips (the other half of the Nov 27 bug).
        await section('calculator', async () => {
            await page.goto(base + '/calculator', { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.querySelectorAll('#roster-pick-1 option').length > 1, null, { timeout: 60000 });
            const pick = await page.evaluate(() => document.querySelector('#roster-pick-1').options[1].value);
            await page.selectOption('#roster-pick-1', pick);
            await page.waitForFunction(() => document.querySelectorAll('.p-chip').length >= 1, null, { timeout: 30000 });
            const chips = await page.evaluate(() => [...document.querySelectorAll('.p-chip')].map((c) => c.textContent.trim()));
            check('calculator', chips.length >= 10, `only ${chips.length} roster chips rendered (expected a full roster)`);
            check('calculator', chips.every((c) => c && !c.includes('undefined')), `roster chips contain bad names (first chips: ${chips.slice(0, 3).join(' | ')})`);
            const calcHasUndefined = await page.evaluate(() => document.body.innerText.includes('undefined'));
            check('calculator', !calcHasUndefined, 'rendered output contains "undefined"');
        });

        // Cap / Player Values table.
        await section('cap', async () => {
            await page.goto(base + '/cap', { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.querySelectorAll('.league-table tbody tr').length >= 50, null, { timeout: 60000 });
            const cap = await page.evaluate(() => {
                const vals = [...document.querySelectorAll('.league-table tbody td[data-label="Value"]')].map((td) => parseFloat(td.textContent.replace(/[^0-9.]/g, '')) || 0);
                return {
                    rows: vals.length,
                    positive: vals.filter((v) => v > 0).length,
                    hasUndefined: document.querySelector('.league-table tbody').innerText.includes('undefined'),
                };
            });
            check('cap', !cap.hasUndefined, 'rendered output contains "undefined"');
            check('cap', cap.positive >= 50, `only ${cap.positive} players carry a value > $0 across ${cap.rows} rows`);
        });
    } finally {
        await browser.close();
    }
    if (failures.length) throw new Error('render check failures:\n' + failures.join('\n'));
    console.log('  render checks passed: team_values, calculator, cap render real values, no "undefined"');
};

const sweep = async () => {
    const port = 4319;
    // --strictPort + the exit check below guard a real failure mode: if a
    // previous run's vite preview child survives (the kill used to reach
    // only the npm wrapper), a new preview silently moves to port 4320 and
    // the sweep ends up testing the OLD build. Fail loudly instead.
    const proc = spawn('npm', ['run', 'preview', '--', '--port', String(port), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore', detached: true });
    try {
        const base = `http://127.0.0.1:${port}`;
        let up = false;
        for (let i = 0; i < 40 && !up; i++) {
            if (proc.exitCode !== null) throw new Error(`preview server exited (code ${proc.exitCode}) — port ${port} is likely held by a stale preview; kill it and re-run`);
            try { await fetch(base + '/'); up = true; } catch { await new Promise((r) => setTimeout(r, 500)); }
        }
        if (!up) throw new Error('preview server did not start');
        const routes = [...new Set([...discoverRoutes('src/routes'), ...DEEP_LINKS])];
        const bad = [];
        for (const r of routes) {
            const res = await fetch(base + r);
            const body = await res.text();
            if (res.status !== 200 || body.includes('Hut, Hut')) bad.push(`${r} -> ${res.status}`);
        }
        if (bad.length) throw new Error('route sweep failures:\n' + bad.join('\n'));
        console.log(`  swept ${routes.length} routes + deep links, all 200`);
        await renderChecks(base);
    } finally {
        // Kill the whole process group: killing only the npm wrapper leaves
        // the vite preview child alive holding the port (see above).
        try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); }
    }
};

step('unit tests', () => run('npm', ['test', '--silent']));
step('manager name check', () => run('npm', ['run', 'check:managers', '--silent']));
step('hex guard', hexGuard);
step('players fetch guard', playersGuard);
step('player shape guard', playerShapeGuard);
step('production build', () => {
    // Locally the Vercel adapter refuses this Node version AFTER both
    // bundles compile — that failure is environmental, not a code error
    // (on Vercel the adapter runs fine). Pass when both bundles built.
    let out = '';
    try {
        out = run('npm', ['run', 'build']);
    } catch (e) {
        out = (e.stdout || '') + (e.stderr || '');
        if ((out.match(/✓ built/g) || []).length < 2) throw e;
        console.log('  (adapter step skipped locally: unsupported Node version — bundles compiled)');
    }
});
await step('preview route sweep', () => sweep());
console.log(`SMOKE PASS in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
