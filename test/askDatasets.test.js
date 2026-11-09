import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRIES } from '../src/lib/ask/registry.js';
import { DATASETS, datasetById, executePlan } from '../src/lib/ask/datasets.js';
import { validatePlan, buildDatasetCatalog } from '../src/lib/ask/llmRoute.js';

const MANAGERS = ['Jake', 'Sam', 'CapKing', 'Trader', 'Middle'];
const combined = [
    { manager: 'CapKing', capRank: 1, tradeRank: 16, draftRank: 16, avgRank: 11 },
    { manager: 'Trader', capRank: 16, tradeRank: 1, draftRank: 2, avgRank: 6.33 },
    { manager: 'Middle', capRank: 8, tradeRank: 8, draftRank: 8, avgRank: 8 },
];

test('validatePlan: strict values, unknown dataset/field/component rejected', () => {
    const ok = validatePlan({ dataset: 'manager-leaderboard', rankBy: ['trades', 'draft'] }, DATASETS, MANAGERS);
    assert.deepEqual(ok.plan.rankBy, ['trades', 'draft']);
    assert.equal(validatePlan({ dataset: 'nope' }, DATASETS, MANAGERS), null);
    assert.equal(validatePlan({ dataset: 'manager-leaderboard', rankBy: ['luck'] }, DATASETS, MANAGERS), null);
    assert.equal(validatePlan({ dataset: 'manager-leaderboard', rankBy: [] }, DATASETS, MANAGERS), null);
    assert.equal(validatePlan({ dataset: 'player-totals', filters: { pos: 'K' } }, DATASETS, MANAGERS), null);
    assert.equal(validatePlan({ dataset: 'player-totals', filters: { season: 'recent' } }, DATASETS, MANAGERS), null);
    assert.equal(validatePlan({ dataset: 'luck', sortBy: 'points' }, DATASETS, MANAGERS), null);
    const clamped = validatePlan({ dataset: 'player-totals', limit: 500 }, DATASETS, MANAGERS);
    assert.equal(clamped.plan.limit, 50);
    const catalog = buildDatasetCatalog(DATASETS);
    assert.equal(catalog.length, 4);
    assert.deepEqual(catalog.find((d) => d.id === 'manager-leaderboard').rankByComponents, ['cap', 'trades', 'draft']);
});

test('plan equivalence: leaderboard rankBy [trades, draft] matches best-manager excludeCap', async () => {
    const entry = ENTRIES.find((e) => e.id === 'best-manager');
    const viaEntry = entry.run({ combined }, { excludeCap: true });
    const viaPlan = await executePlan(datasetById('manager-leaderboard'), { combined }, { rankBy: ['trades', 'draft'] });
    assert.deepEqual(viaPlan.rows.map((r) => r.label), viaEntry.rows.map((r) => r.label));
    assert.deepEqual(viaPlan.rows.map((r) => r.value), viaEntry.rows.map((r) => r.value));
    assert.ok(viaPlan.headline.includes('excluded'));
    const draftOnly = await executePlan(datasetById('manager-leaderboard'), { combined }, { rankBy: ['draft'] });
    assert.equal(draftOnly.rows[0].label, 'Trader'); // draft rank 2 beats Middle 8, CapKing 16
});

test('player-totals plan: all-time aggregation, position filter, limit', async () => {
    const ctx = {
        anatomy: { seasons: [2026, 2025], currentYear: 2026 },
        players: { 1: { fn: 'A', ln: 'One', pos: 'RB' }, 2: { fn: 'B', ln: 'Two', pos: 'WR' } },
        playerTotals: async (season) => ({
            2025: [{ id: '1', points: 100 }, { id: '2', points: 50 }],
            2026: [{ id: '1', points: 30 }, { id: '2', points: 90 }],
        }[season]),
    };
    const all = await executePlan(datasetById('player-totals'), ctx, { filters: { season: 'all' } });
    assert.equal(all.rows[0].label, 'B Two'); // 140 vs 130
    assert.equal(all.rows[0].value, '140.00');
    const rbOnly = await executePlan(datasetById('player-totals'), ctx, { filters: { season: 2025, pos: 'RB' } });
    assert.deepEqual(rbOnly.rows.map((r) => r.label), ['A One']);
    assert.ok(rbOnly.headline.includes('2025'));
});

test('luck plan: all-time sums and direction flip', async () => {
    const ctx = {
        nameFor: (_season, rosterID) => `M${rosterID}`,
        anatomy: {
            seasons: [2025, 2026], currentYear: 2026,
            teamSeasons: {
                a: { season: 2025, rosterID: 1, wins: 8, expectedWins: 6.5, luck: 1.5 },
                b: { season: 2026, rosterID: 1, wins: 6, expectedWins: 6.0, luck: 0.0 },
                c: { season: 2025, rosterID: 2, wins: 5, expectedWins: 7.0, luck: -2.0 },
                d: { season: 2026, rosterID: 2, wins: 9, expectedWins: 7.5, luck: 1.5 },
            },
        },
    };
    const desc = await executePlan(datasetById('luck'), ctx, { filters: { season: 'all' } });
    assert.deepEqual(desc.rows.map((r) => r.label), ['M1', 'M2']); // +1.5 vs -0.5
    const asc = await executePlan(datasetById('luck'), ctx, { filters: { season: 'all' }, sortDir: 'asc' });
    assert.deepEqual(asc.rows.map((r) => r.label), ['M2', 'M1']);
    assert.ok(asc.headline.includes('unluckiest'));
});
