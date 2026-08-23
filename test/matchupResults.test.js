import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchupWeeks } from '../src/lib/utils/helperFunctions/matchupResults.js';

test('preserves original week labels when a middle matchup request fails', () => {
  const requests = [{ week: 1 }, { week: 2 }, { week: 3 }];
  const results = [
    { status: 'fulfilled', value: [{ matchup_id: 1, roster_id: 1, starters: [], starters_points: [] }] },
    { status: 'rejected', reason: new Error('timeout') },
    { status: 'fulfilled', value: [{ matchup_id: 3, roster_id: 3, starters: [], starters_points: [] }] }
  ];

  const { matchupWeeks, failedWeeks } = buildMatchupWeeks(requests, results);

  assert.deepEqual(failedWeeks, [2]);
  assert.equal(matchupWeeks[1].week, 2);
  assert.equal(matchupWeeks[1].unavailable, true);
  assert.equal(matchupWeeks[2].week, 3);
  assert.equal(matchupWeeks[2].matchups[3][0].roster_id, 3);
});