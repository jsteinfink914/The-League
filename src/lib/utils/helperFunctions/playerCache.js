export const PLAYER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function getPlayerCacheExpiration(now = Date.now()) {
  return now + PLAYER_CACHE_TTL_MS;
}

export function hasFreshPlayerCache(cachedPlayers, expiration, now = Date.now(), refresh = false) {
  return Boolean(
    !refresh &&
    cachedPlayers?.[1426] &&
    Number.isFinite(expiration) &&
    expiration > now
  );
}