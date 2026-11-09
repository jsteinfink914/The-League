import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedWinsByRoster, luckValue, scheduleLuckValues, sosValues, roundTo } from '../src/lib/utils/helperFunctions/standingsMath.js';

test('all-play expected wins: weekly shares of the league beaten', () => {
    const weekScores = [
        [{ rosterID: 1, points: 100 }, { rosterID: 2, points: 90 }, { rosterID: 3, points: 80 }],
        [{ rosterID: 1, points: 70 }, { rosterID: 2, points: 90 }, { rosterID: 3, points: 80 }],
    ];
    const exp = expectedWinsByRoster(weekScores);
    assert.equal(exp[1], 1);   // beat both, then neither
    assert.equal(exp[2], 1.5); // beat one, then both
    assert.equal(exp[3], 0.5); // beat neither, then one
});

test('luck is wins (ties half) minus expected wins, one decimal', () => {
    assert.equal(luckValue(4, 0, 4.2), -0.2);
    assert.equal(luckValue(5, 1, 4.5), 1);
    assert.equal(luckValue(0, 0, 0), 0);
});

test('SOS values and ranks are raw numbers, toughest = rank 1', () => {
    const standings = {
        1: { wins: 3, losses: 1, ties: 0 },
        2: { wins: 1, losses: 3, ties: 0 },
        3: { wins: 2, losses: 2, ties: 0 },
    };
    const scheduleInfo = {
        points: { 1: 400, 2: 300, 3: 350 },
        games: { 1: 4, 2: 4, 3: 4 },
        faced: { 1: [2, 3], 2: [1, 3], 3: [1, 2] },
    };
    const sos = sosValues(standings, scheduleInfo);
    assert.equal(sos[1].sos, 81.25);
    assert.equal(sos[2].sos, 93.75);
    assert.equal(sos[3].sos, 87.5);
    assert.equal(sos[2].sosRank, 1);
    assert.equal(sos[3].sosRank, 2);
    assert.equal(sos[1].sosRank, 3);
    assert.equal(sos[1].sosRecord, 0.375);
    assert.equal(sos[2].sosRecord, 0.625);
    assert.equal(sos[2].sosRecordRank, 1);
    assert.equal(typeof sos[1].sos, 'number');
});

test('roundTo rounds half up at the requested decimals', () => {
    assert.equal(roundTo(112.414, 2), 112.41);
    assert.equal(roundTo(112.415, 2), 112.42);
    assert.equal(roundTo(0.5474, 3), 0.547);
});


test('schedule luck: symmetric home/away splits cancel out', () => {
    const weekScores = [
        [{ rosterID: 1, points: 100 }, { rosterID: 2, points: 80 }],
        [{ rosterID: 1, points: 100 }, { rosterID: 2, points: 120 }],
    ];
    const faced = { 1: [2, 2], 2: [1, 1] };
    const out = scheduleLuckValues(weekScores, faced);
    assert.equal(out[1].sosLuck, 0);
    assert.equal(out[2].sosLuck, 0);
});

test('schedule luck: opponents underperforming against you is positive luck', () => {
    const weekScores = [
        [{ rosterID: 1, points: 90 }, { rosterID: 2, points: 70 }, { rosterID: 3, points: 110 }],
        [{ rosterID: 2, points: 100 }, { rosterID: 3, points: 95 }, { rosterID: 1, points: 105 }],
        [{ rosterID: 2, points: 100 }, { rosterID: 3, points: 88 }, { rosterID: 1, points: 99 }],
    ];
    const faced = { 1: [2, 3, 3], 2: [1, 3, 3], 3: [2, 2, 1] };
    const out = scheduleLuckValues(weekScores, faced);
    assert.equal(out[1].sosLuck, 16.2);
    assert.equal(out[1].sosLuckRank, 1);
    assert.equal(out[3].sosLuck, 4.5);
});
