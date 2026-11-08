import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveTradeWeek } from '../src/lib/utils/helperFunctions/tradeWeek.js';

const activity = new Map([['S1', new Map([[7, 1000], [8, 2000]])]]);

test('trade completed inside its creation bucket counts from that week', () => {
    assert.equal(effectiveTradeWeek({ _week: 7, _seasonID: 'S1', created: 500, status_updated: 900 }, activity), 7);
});

test('trade completed after the bucket went quiet counts from the next week', () => {
    // The McConkey shape: created in week 7, other activity followed in the
    // bucket, and the trade only completed after all of it.
    assert.equal(effectiveTradeWeek({ _week: 7, _seasonID: 'S1', created: 500, status_updated: 1500 }, activity), 8);
});

test('no bump when the bucket had no activity after the trade was created', () => {
    const quiet = new Map([['S1', new Map([[7, 500]])]]);
    assert.equal(effectiveTradeWeek({ _week: 7, _seasonID: 'S1', created: 500, status_updated: 1500 }, quiet), 7);
});

test('missing bucket or unknown season falls back to the bucket week / week 1', () => {
    assert.equal(effectiveTradeWeek({ _seasonID: 'S1', created: 1, status_updated: 2 }, activity), 1);
    assert.equal(effectiveTradeWeek({ _week: 7, _seasonID: 'UNKNOWN', created: 500, status_updated: 1500 }, activity), 7);
});
