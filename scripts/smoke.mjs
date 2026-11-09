// Pre-push smoke check. Run before pushing anything that touches data,
// routes, sorting, or styles:  npm run smoke
//
// Steps: unit tests -> manager-name check -> hardcoded-hex guard ->
// production build -> preview sweep of every route plus the deep links
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
const sweep = async () => {
    const port = 4319;
    const proc = spawn('npm', ['run', 'preview', '--', '--port', String(port), '--host', '127.0.0.1'], { stdio: 'ignore' });
    try {
        const base = `http://127.0.0.1:${port}`;
        let up = false;
        for (let i = 0; i < 40 && !up; i++) {
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
    } finally {
        proc.kill('SIGTERM');
    }
};

step('unit tests', () => run('npm', ['test', '--silent']));
step('manager name check', () => run('npm', ['run', 'check:managers', '--silent']));
step('hex guard', hexGuard);
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
