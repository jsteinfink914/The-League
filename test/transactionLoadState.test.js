import test from 'node:test';
import assert from 'node:assert/strict';
import { getTransactionLoadError } from '../src/lib/Transactions/transactionLoadState.js';

test('transaction load state reports failures from every required dependency', () => {
  assert.equal(
    getTransactionLoadError([{ error: 'Transaction data timed out.' }, {}, {}]),
    'Transaction data timed out.'
  );
  assert.equal(
    getTransactionLoadError([{}, { error: 'Player data timed out.' }, {}]),
    'Player data timed out.'
  );
  assert.equal(
    getTransactionLoadError([{}, {}, { error: 'League manager data timed out.' }]),
    'League manager data timed out.'
  );
});