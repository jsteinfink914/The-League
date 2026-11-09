import test from 'node:test';
import assert from 'node:assert/strict';
import { extractParams, matchEntry } from '../src/lib/ask/matcher.js';
import { ENTRIES, entryById } from '../src/lib/ask/registry.js';
import { aggregatePlayerTotals } from '../src/lib/ask/playerTotals.js';

const CTX = { seasonsDesc: [2026, 2025, 2024, 2023, 2022], managerNames: ['Jake', 'Vinnie', 'Oscar', 'Dev'] };

test('matcher: extracts season, position, topN, manager', () => {
    const p = extractParams('Top 15 RBs in 2024 for Jake', CTX);
    assert.equal(p.season, 2024);
    assert.equal(p.pos, 'RB');
    assert.equal(p.topN, 15);
    assert.equal(p.manager, 'Jake');
    assert.equal(extractParams('luckiest ever', CTX).season, 'all');
    assert.equal(extractParams('who scored 30+ this year', CTX).threshold, 30);
});

test("matcher: Jake's three example questions land on the right entries", () => {
    assert.equal(matchEntry(ENTRIES, 'What stats do we have on the site?', CTX).entry.id, 'directory');
    assert.equal(matchEntry(ENTRIES, 'What stats tell me if I know ball?', CTX).entry.id, 'know-ball');
    assert.equal(matchEntry(ENTRIES, 'Who scored the most fantasy points in 2025, top 15?', CTX).entry.id, 'player-points');
    assert.equal(matchEntry(ENTRIES, 'luckiest manager', CTX).entry.id, 'luck');
    assert.equal(matchEntry(ENTRIES, 'toughest schedule 2026', CTX).entry.id, 'sos');
    assert.equal(matchEntry(ENTRIES, 'asdf qwer zzzz', CTX), null);
});

test('registry: luck query ranks by summed luck and formats rows', () => {
    const ts = (season, rosterID, luck, wins = 5, expectedWins = 5) => ({
        season, rosterID, wins, expectedWins, luck, games: 8, scheduleLuck: 0,
        pointsFor: 800, pfPerGame: 100, paPerGame: 95, sosPts: 100, pfRank: 1, paRank: 1,
        scheduleLuckRank: 1, edges: { QB: 0, RB: 0, WR: 0, TE: 0 },
    });
    const anatomy = {
        seasons: [2026, 2025], currentYear: 2026, games: [],
        teamSeasons: { '2026-1': ts(2026, 1, 2.5), '2026-2': ts(2026, 2, -1), '2025-1': ts(2025, 1, 1) },
        laws: { ladder: [], correlations: [] },
    };
    const ctx = { anatomy, nameFor: (_s, id) => ({ 1: 'Alpha', 2: 'Beta' })[id] };
    const all = entryById('luck').run(ctx, { season: 'all' });
    assert.equal(all.rows[0].label, 'Alpha');
    assert.equal(all.rows[0].value, '+3.5');
    const y2026 = entryById('luck').run(ctx, { season: 2026 });
    assert.equal(y2026.rows[0].value, '+2.5');
});

test('playerTotals: sums starters only, skips the 0 slot, rounds', () => {
    const weeks = [
        [{ starters: ['a', 'b', '0'], starters_points: [10.5, 20, 99] }, { starters: ['a'], starters_points: [5] }],
        [{ starters: ['b'], starters_points: [7.25] }],
    ];
    const totals = aggregatePlayerTotals(weeks);
    assert.deepEqual(totals, [{ id: 'b', points: 27.25 }, { id: 'a', points: 15.5 }]);
});
