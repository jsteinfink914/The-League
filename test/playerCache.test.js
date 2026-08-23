import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPlayerCacheExpiration,
  hasFreshPlayerCache,
  PLAYER_CACHE_TTL_MS
} from '../src/lib/utils/helperFunctions/playerCache.js';

test('uses a valid millisecond player cache without requiring a refresh', () => {
  const now = 1_700_000_000_000;
  const cachedPlayers = { 1426: { first_name: 'Test', last_name: 'Player' } };
  const expiration = getPlayerCacheExpiration(now);

  assert.equal(expiration, now + PLAYER_CACHE_TTL_MS);
  assert.equal(hasFreshPlayerCache(cachedPlayers, expiration, now), true);
  assert.equal(hasFreshPlayerCache(cachedPlayers, expiration, now, true), false);
  assert.equal(hasFreshPlayerCache(cachedPlayers, now - 1, now), false);
});