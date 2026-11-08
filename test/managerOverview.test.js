import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCombined } from '../src/lib/utils/helperFunctions/managerOverview.js';

const capData = {
    seasonTrends: [
        { manager: 'Oscar', capHit: 600, starterPts: 300, rosterPts: 400 },
        { manager: 'Oscar', capHit: 100, starterPts: 50, rosterPts: 60 },
        { manager: 'Jake', capHit: 700, starterPts: 350, rosterPts: 500 },
    ],
};
const tradeData = {
    teamSummary: [
        { manager: 'Oscar', netStarterSurplus: 12.5, totalReceivedStarter: 100, tradeCount: 3, pendingPickCount: 1 },
        { manager: 'Jake', netStarterSurplus: -5, totalReceivedStarter: 80, tradeCount: 2, pendingPickCount: 0 },
    ],
};
const draftData = {
    teamSummary: [
        { manager: 'Oscar', totalStarterPts: 900, avgStarterPtsPerPick: 45, bestPick: { player: 'X' } },
        { manager: 'Jake', totalStarterPts: 700, avgStarterPtsPerPick: 35, bestPick: null },
    ],
};

test('consistent names join into one row per manager with all three ranks', () => {
    const rows = buildCombined(capData, tradeData, draftData);
    assert.equal(rows.length, 2);
    const oscar = rows.find((r) => r.manager === 'Oscar');
    assert.equal(oscar.capStarterPts, 350); // aggregated across both seasons
    assert.equal(oscar.dollarPerStarterPt, 2);
    assert.equal(oscar.netTradeSurplus, 12.5);
    assert.equal(oscar.tradeRank, 1);
    assert.equal(oscar.draftRank, 1);
    assert.equal(oscar.draftTotalPts, 900);
    assert.notEqual(oscar.avgRank, null);
});

test('a name spelled differently in one source splits the manager into two rows', () => {
    // This is the Ska/Oscar failure shape. The join itself cannot know the
    // two spellings are one person — scripts/check-manager-names.mjs exists
    // to catch the drift at the source; this test pins the behavior so the
    // failure mode stays visible rather than silent.
    const driftedTrade = {
        teamSummary: [
            { manager: 'Ska', netStarterSurplus: 12.5, totalReceivedStarter: 100, tradeCount: 3, pendingPickCount: 1 },
            { manager: 'Jake', netStarterSurplus: -5, totalReceivedStarter: 80, tradeCount: 2, pendingPickCount: 0 },
        ],
    };
    const rows = buildCombined(capData, driftedTrade, draftData);
    assert.equal(rows.length, 3);
    const oscar = rows.find((r) => r.manager === 'Oscar');
    assert.equal(oscar.netTradeSurplus, 0);
    assert.equal(oscar.tradeRank, null);
    const ska = rows.find((r) => r.manager === 'Ska');
    assert.equal(ska.capStarterPts, 0);
    assert.equal(ska.capRank, null);
});

test('missing datasets produce no rows', () => {
    assert.deepEqual(buildCombined(null, tradeData, draftData), []);
    assert.deepEqual(buildCombined(capData, null, draftData), []);
});
