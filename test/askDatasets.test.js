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
    assert.equal(catalog.length, 12);
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

// ---------------------------------------------------------------------
// Coverage pass (Nov 9): datasets promoted from existing site tables.
// Fixtures are shaped exactly like the producers' outputs:
// tradeAnalysis teamSummary.posBreakdown / trades[].sides[].playerDetails,
// draftAnalysis teamSummary / drafts[].picks, capAnalysis
// playerEfficiency + cap-history playerHistory / seasonTrends.
// ---------------------------------------------------------------------
import { aggregateMostTradedPlayers } from '../src/lib/utils/helperFunctions/mostTradedMath.js';

const overviewFixture = {
    tradeData: {
        trades: [
            { id: 't1', year: 2025, date: 'Oct 5, 2025', sides: [
                { manager: 'Jake', netStarterSurplus: 50.5, playerDetails: [{ playerID: 'p1', name: 'Traded Tom', position: 'WR', starterPts: 60.5, rosterPts: 70 }], pickDetails: [] },
                { manager: 'Sam', netStarterSurplus: -50.5, playerDetails: [{ playerID: 'p2', name: 'Given Gary', position: 'RB', starterPts: 10, rosterPts: 12 }], pickDetails: [] },
            ] },
            { id: 't2', year: 2026, date: 'Sep 9, 2026', sides: [
                { manager: 'Sam', netStarterSurplus: 20, playerDetails: [{ playerID: 'p1', name: 'Traded Tom', position: 'WR', starterPts: 30, rosterPts: 33 }], pickDetails: [] },
                { manager: 'Jake', netStarterSurplus: -20, playerDetails: [], pickDetails: [] },
            ] },
        ],
        teamSummary: [
            { manager: 'Jake', tradeCount: 2, totalReceivedStarter: 60.5, posBreakdown: { WR: { starterPts: 60.5, rosterPts: 70, count: 1 }, RB: { starterPts: 0, rosterPts: 0, count: 0 } } },
            { manager: 'Sam', tradeCount: 2, totalReceivedStarter: 40, posBreakdown: { WR: { starterPts: 30, rosterPts: 33, count: 1 }, RB: { starterPts: 10, rosterPts: 12, count: 1 } } },
        ],
    },
    draftData: {
        teamSummary: [
            { manager: 'Jake', totalPicks: 10, totalStarterPts: 500, posBreakdown: { TE: { starterPts: 120, rosterPts: 130, count: 2 } } },
            { manager: 'Sam', totalPicks: 10, totalStarterPts: 450, posBreakdown: { TE: { starterPts: 80, rosterPts: 90, count: 3 } } },
        ],
        drafts: [
            { year: 2025, picks: [
                { playerName: 'Pick Pete', position: 'WR', manager: 'Jake', round: 1, starterPts: 200, rosterPts: 210 },
                { playerName: 'Late Larry', position: 'RB', manager: 'Sam', round: 4, starterPts: 50, rosterPts: 55 },
            ] },
        ],
    },
};

test('mostTradedMath: counts each trade-side appearance, sums stint points', () => {
    const rows = aggregateMostTradedPlayers(overviewFixture.tradeData.trades);
    const tom = rows.find((r) => r.name === 'Traded Tom');
    assert.equal(tom.tradeCount, 2);
    assert.equal(tom.starterPts, 90.5);
    assert.equal(tom.managerCount, 2);
    assert.equal(tom.managers, 'Jake, Sam');
});

test('most-traded dataset: ranks by count, position filter applies', async () => {
    const all = await executePlan(datasetById('most-traded-players'), { overview: overviewFixture }, {});
    assert.equal(all.rows[0].label, 'Traded Tom');
    assert.equal(all.rows[0].value, '2 trades');
    const rb = await executePlan(datasetById('most-traded-players'), { overview: overviewFixture }, { filters: { pos: 'RB' } });
    assert.deepEqual(rb.rows.map((r) => r.label), ['Given Gary']);
});

test('trader/drafter by position: reads producer posBreakdown', async () => {
    const wr = await executePlan(datasetById('trader-by-position'), { overview: overviewFixture }, { filters: { pos: 'WR' } });
    assert.equal(wr.rows[0].label, 'Jake');
    assert.equal(wr.rows[0].value, '60.5 pts');
    const te = await executePlan(datasetById('drafter-by-position'), { overview: overviewFixture }, { filters: { pos: 'TE' } });
    assert.equal(te.rows[0].label, 'Jake');
    assert.equal(te.rows[0].sub, '2 TE picks');
});

test('trade-swings: biggest win/loss per side, manager filter', async () => {
    const wins = await executePlan(datasetById('trade-swings'), { overview: overviewFixture }, {});
    assert.equal(wins.rows[0].label, 'Jake — 2025');
    assert.equal(wins.rows[0].value, '+50.5 pts');
    const losses = await executePlan(datasetById('trade-swings'), { overview: overviewFixture }, { sortBy: 'surplus', sortDir: 'asc' });
    assert.equal(losses.rows[0].value, '-50.5 pts');
    const sam = await executePlan(datasetById('trade-swings'), { overview: overviewFixture }, { filters: { manager: 'Sam' } });
    assert.equal(sam.rows[0].label, 'Sam — 2026');
});

test('draft-picks dataset: best individual picks, season filter', async () => {
    const all = await executePlan(datasetById('draft-picks'), { overview: overviewFixture }, {});
    assert.equal(all.rows[0].label, 'Pick Pete');
    assert.ok(all.rows[0].sub.includes('Round 1'));
    const none = await executePlan(datasetById('draft-picks'), { overview: overviewFixture }, { filters: { season: 2024 } });
    assert.equal(none.rows.length, 0);
});

const capEffFixture = {
    currentYear: 2026,
    playerRows: [
        { name: 'Cheap Star', position: 'RB', manager: 'Jake', year: 2025, capHit: 100, starterPts: 50, rosterPts: 60 },
        { name: 'Cheap Star', position: 'RB', manager: 'Jake', year: 2026, capHit: 10, starterPts: 100, rosterPts: 110 },
        { name: 'Pricey Pete', position: 'WR', manager: 'Sam', year: 2026, capHit: 80, starterPts: 40, rosterPts: 44 },
        { name: 'Zero Zed', position: 'TE', manager: 'Sam', year: 2026, capHit: 5, starterPts: 0, rosterPts: 0 },
    ],
    seasonTrends: [
        { year: 2025, manager: 'Jake', capHit: 300, starterPts: 600, rosterPts: 700 },
        { year: 2026, manager: 'Jake', capHit: 100, starterPts: 400, rosterPts: 450 },
        { year: 2026, manager: 'Sam', capHit: 200, starterPts: 100, rosterPts: 120 },
    ],
};

test('cap-efficiency players: season-scoped by default, $/pt ascending', async () => {
    const cur = await executePlan(datasetById('cap-efficiency-players'), { capEff: capEffFixture }, {});
    assert.equal(cur.rows[0].label, 'Cheap Star');
    assert.equal(cur.rows[0].value, '$0.10/pt');
    assert.equal(cur.rows.length, 2); // Zero Zed (0 pts) excluded, 2025 row out of scope
    const y2025 = await executePlan(datasetById('cap-efficiency-players'), { capEff: capEffFixture }, { filters: { season: 2025 } });
    assert.deepEqual(y2025.rows.map((r) => r.value), ['$2.00/pt']);
});

test('cap-efficiency players: all-time is a cost-weighted sum, NOT an average of ratios', async () => {
    const all = await executePlan(datasetById('cap-efficiency-players'), { capEff: capEffFixture }, { filters: { season: 'all' } });
    const cheap = all.rows.find((r) => r.label === 'Cheap Star');
    // (100 + 10) cap / (50 + 100) pts = 0.7333 -> $0.73/pt.
    // An average of the yearly ratios would be (2.00 + 0.10) / 2 = $1.05/pt.
    assert.equal(cheap.value, '$0.73/pt');
});

test('cap-efficiency teams: season scope and all-time sums', async () => {
    const cur = await executePlan(datasetById('cap-efficiency-teams'), { capEff: capEffFixture }, {});
    assert.equal(cur.rows[0].label, 'Jake');
    assert.equal(cur.rows[0].value, '$0.25/pt');
    const all = await executePlan(datasetById('cap-efficiency-teams'), { capEff: capEffFixture }, { filters: { season: 'all' } });
    assert.equal(all.rows[0].label, 'Jake');
    assert.equal(all.rows[0].value, '$0.40/pt'); // 400 cap / 1000 pts
});

test('cap-efficiency plans validate: efficiency sort, bad sort rejected', () => {
    const ok = validatePlan({ dataset: 'cap-efficiency-players', filters: { season: 'all' }, sortBy: 'efficiency', sortDir: 'asc' }, DATASETS, MANAGERS);
    assert.equal(ok.dataset.id, 'cap-efficiency-players');
    assert.equal(validatePlan({ dataset: 'cap-efficiency-players', sortBy: 'vibes' }, DATASETS, MANAGERS), null);
});

test('player-seasons: one row per player-season, never summed', async () => {
    const ctx = {
        anatomy: { seasons: [2026, 2025], currentYear: 2026 },
        players: { 1: { fn: 'A', ln: 'One', pos: 'RB' }, 2: { fn: 'B', ln: 'Two', pos: 'WR' } },
        playerTotals: async (season) => ({
            2025: [{ id: '1', points: 100 }, { id: '2', points: 50 }],
            2026: [{ id: '1', points: 30 }, { id: '2', points: 90 }],
        }[season]),
    };
    const all = await executePlan(datasetById('player-seasons'), ctx, { filters: { season: 'all' } });
    assert.equal(all.rows.length, 4);
    assert.equal(all.rows[0].label, 'A One');
    assert.ok(all.rows[0].sub.includes('2025'));
    assert.equal(all.rows[0].value, '100.00'); // the single 2025 season, not the 130 sum
});
