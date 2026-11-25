import { leagueID } from '$lib/utils/leagueInfo';
import { getNflState } from './nflState';
import { fetchJson } from './request';

// A cheap freshness probe for session caches whose contents depend on
// transactions (Trade Analysis, Cap Analysis, Manager Overview): the
// newest completed transaction in the current and previous NFL weeks.
// One or two small requests — if the fingerprint differs from the one a
// cache was built under, a trade (or waiver/FA move) has processed since
// and the cache must rebuild. If the probe itself fails, the returned
// sentinel never matches a stored fingerprint, so caches fail open
// toward rebuilding rather than serving possibly-stale data.
export async function getTransactionFingerprint() {
  try {
    let week = 18;
    try {
      const nflState = await getNflState();
      if (nflState?.season_type === 'regular') week = nflState.week;
      else if (nflState?.season_type === 'pre') week = 1;
    } catch { /* keep the week-18 default */ }
    const weeks = week > 1 ? [week, week - 1] : [week];
    const perWeek = await Promise.all(weeks.map(async (w) => {
      try {
        return await fetchJson(`https://api.sleeper.app/v1/league/${leagueID}/transactions/${w}`, { compress: true });
      } catch { return null; }
    }));
    if (perWeek.every((r) => !Array.isArray(r))) return `unavailable:${Date.now()}`;
    let latest = '';
    let count = 0;
    for (const txns of perWeek) {
      if (!Array.isArray(txns)) continue;
      for (const t of txns) {
        if (t.status !== 'complete') continue;
        count++;
        const id = String(t.transaction_id || '');
        if (id > latest) latest = id;
      }
    }
    return `${latest}:${count}`;
  } catch {
    return `unavailable:${Date.now()}`;
  }
}
