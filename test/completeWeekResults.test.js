import test from 'node:test';
import assert from 'node:assert/strict';
import { requireCompleteWeekResults } from '../src/lib/utils/helperFunctions/completeWeekResults.js';

test('analytics reject incomplete weekly data instead of returning zero-filled results', () => {
  assert.throws(
    () => requireCompleteWeekResults([
      { status: 'fulfilled', value: [{ roster_id: 1 }] },
      { status: 'rejected', reason: new Error('timeout') }
    ], 'Cap analysis'),
    /week 2 could not be loaded/
  );
});

test('analytics reject malformed fulfilled weekly data', () => {
  assert.throws(
    () => requireCompleteWeekResults([{ status: 'fulfilled', value: { invalid: true } }], 'Trade analysis'),
    /malformed week data/
  );
});