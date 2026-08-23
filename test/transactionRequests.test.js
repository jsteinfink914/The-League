import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionRequests } from '../src/lib/utils/helperFunctions/transactionRequests.js';

test('transaction request loaders retain the week they were created for', async () => {
  const requested = [];
  const requests = createTransactionRequests(['season-a'], 3, async (seasonID, week) => {
    requested.push(`${seasonID}:${week}`);
    return [];
  });

  assert.deepEqual(requests.map(({ week }) => week), [3, 2, 1]);
  await Promise.all(requests.map((request) => request.load()));
  assert.deepEqual(requested, ['season-a:3', 'season-a:2', 'season-a:1']);
});