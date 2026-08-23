import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMatchupLoadState } from '../src/lib/Matchups/matchupLoadState.js';

test('matchup load state renders a required dependency failure without dereferencing it', () => {
  const state = resolveMatchupLoadState({
    matchupsInfo: { error: 'Matchup data timed out.' },
    bracketsInfo: { error: 'Bracket data timed out.' },
    managerInfo: {},
    playersInfo: {}
  });

  assert.equal(state.errorMessage, 'Matchup data timed out.');
  assert.equal(state.brackets, null);
});

test('matchup load state keeps regular-season data when only brackets fail', () => {
  const state = resolveMatchupLoadState({
    matchupsInfo: { matchupWeeks: [{ week: 1 }], year: '2026', week: 1, regularSeasonLength: 14 },
    bracketsInfo: { error: 'Bracket data timed out.' },
    managerInfo: { managers: [] },
    playersInfo: { players: { 1: { first_name: 'Test' } } }
  });

  assert.equal(state.errorMessage, '');
  assert.equal(state.matchupWeeks.length, 1);
  assert.equal(state.brackets, null);
  assert.equal(state.bracketError, 'Bracket data timed out.');
});