// Manager-name consistency check.
//
// The same manager is named in several independent places: leagueInfo.js
// (the canonical list), static/Manager_map.txt (cap pages), and
// static/cap-history.json (precomputed Manager Overview history). When one
// source drifts — the "Ska" vs "Oscar" split — pages that join datasets on
// the name string silently split one manager into two rows. This script
// fails loudly instead. Run: npm run check:managers
import { readFile } from 'node:fs/promises';
import { managers } from '../src/lib/utils/leagueInfo.js';

const canonical = new Set(managers.map((m) => m.name));
const problems = [];

if (managers.length !== 16) problems.push(`leagueInfo.js lists ${managers.length} managers, expected 16`);
if (canonical.size !== managers.length) problems.push('leagueInfo.js contains duplicate manager names');

// Manager_map.txt: CSV "Index,Name", index = roster_id.
const mapText = await readFile(new URL('../static/Manager_map.txt', import.meta.url), 'utf8');
const mapNames = mapText.trim().split('\n').slice(1).map((line) => line.split(',')[1]?.trim()).filter(Boolean);
if (mapNames.length !== 16) problems.push(`Manager_map.txt lists ${mapNames.length} managers, expected 16`);
for (const name of mapNames) {
    if (!canonical.has(name)) problems.push(`Manager_map.txt names "${name}", which is not a leagueInfo manager`);
}

// cap-history.json: every "manager" label anywhere in the structure.
const history = JSON.parse(await readFile(new URL('../static/cap-history.json', import.meta.url), 'utf8'));
const historyNames = new Set();
const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.manager === 'string') historyNames.add(node.manager);
    for (const value of Object.values(node)) walk(value);
};
walk(history);
for (const name of historyNames) {
    if (!canonical.has(name)) problems.push(`cap-history.json names "${name}", which is not a leagueInfo manager`);
}

if (problems.length) {
    console.error('Manager-name consistency check FAILED:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
}
console.log(`Manager names consistent: ${canonical.size} canonical managers; Manager_map.txt (${mapNames.length}) and cap-history.json (${historyNames.size} distinct labels) all match leagueInfo.`);
