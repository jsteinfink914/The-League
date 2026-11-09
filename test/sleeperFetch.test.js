import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJsonCached, clearFetchJsonCache } from '../src/lib/utils/helperFunctions/request.js';

// A counting fake fetcher with the same contract fetchWithRetry
// expects: resolves { ok, status, json() }.
const makeFetcher = (behavior) => {
    const calls = [];
    const fetcher = async (url) => {
        calls.push(url);
        const out = behavior(url, calls.length);
        if (out instanceof Error) throw out;
        return { ok: true, status: 200, json: async () => out };
    };
    return { fetcher, calls };
};

test('fetchJsonCached: concurrent and repeat calls share one network fetch', async () => {
    clearFetchJsonCache();
    const { fetcher, calls } = makeFetcher(() => ({ hello: 'world' }));
    const [a, b] = await Promise.all([
        fetchJsonCached('https://x.test/a', {}, { fetcher }),
        fetchJsonCached('https://x.test/a', {}, { fetcher }),
    ]);
    const c = await fetchJsonCached('https://x.test/a', {}, { fetcher });
    assert.equal(calls.length, 1);
    assert.deepEqual(a, { hello: 'world' });
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
    await fetchJsonCached('https://x.test/b', {}, { fetcher });
    assert.equal(calls.length, 2); // different URL, different fetch
});

test('fetchJsonCached: failures are evicted, never cached', async () => {
    clearFetchJsonCache();
    // Fail with retryable 500s through the first call's whole retry
    // budget (3 attempts), then recover.
    const fetcher = async (url) => {
        fetcher.calls.push(url);
        if (fetcher.calls.length <= 3) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ recovered: true }) };
    };
    fetcher.calls = [];
    await assert.rejects(fetchJsonCached('https://x.test/flaky', {}, { fetcher }));
    const after = await fetchJsonCached('https://x.test/flaky', {}, { fetcher });
    assert.deepEqual(after, { recovered: true });
    assert.ok(fetcher.calls.length >= 4, 'the failed call did not poison the cache');
});
