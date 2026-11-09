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

import { resolveTurn } from '../src/lib/ask/matcher.js';
import { validatePick, validatePicks, buildCatalog, narrationIsGrounded, mergeExtractedParams, buildRoutePrompt, pickOutcome } from '../src/lib/ask/llmRoute.js';
import { DATASETS } from '../src/lib/ask/datasets.js';

test("matcher: 'Best at drafting' lands on the drafter query", () => {
    assert.equal(matchEntry(ENTRIES, 'Best at drafting', CTX).entry.id, 'best-drafter');
    assert.equal(matchEntry(ENTRIES, 'best at trading', CTX).entry.id, 'best-trader');
    assert.equal(matchEntry(ENTRIES, 'Who scored the most fantasy points in 2025, top 15?', CTX).entry.id, 'player-points');
});

test('resolveTurn: param-only follow-ups re-run the previous entry with merged params', () => {
    const last = { entry: entryById('player-points'), params: { season: 2025, topN: 15 } };
    const t1 = resolveTurn(ENTRIES, 'what about 2024?', CTX, last);
    assert.equal(t1.entry.id, 'player-points');
    assert.equal(t1.followUp, true);
    assert.deepEqual(t1.params, { season: 2024, topN: 15 });
    const t2 = resolveTurn(ENTRIES, 'and just the RBs, top 5', CTX, last);
    assert.equal(t2.entry.id, 'player-points');
    assert.deepEqual(t2.params, { season: 2025, topN: 5, pos: 'RB' });
    const t3 = resolveTurn(ENTRIES, 'who is the luckiest manager?', CTX, last);
    assert.equal(t3.entry.id, 'luck');
    assert.equal(t3.followUp, false);
    const t4 = resolveTurn(ENTRIES, 'asdf qwer', CTX, last);
    assert.equal(t4, null);
});

test('registry: drafter/trader queries rank combined rows', () => {
    const combined = [
        { manager: 'A', draftRank: 2, draftTotalPts: 100, draftAvgPtsPerPick: 5, tradeRank: 1, netTradeSurplus: 40, tradeCount: 3, capRank: 4, avgRank: 2.3 },
        { manager: 'B', draftRank: 1, draftTotalPts: 250, draftAvgPtsPerPick: 9, tradeRank: 2, netTradeSurplus: -10, tradeCount: 1, capRank: 1, avgRank: 1.3 },
    ];
    const d = entryById('best-drafter').run({ combined }, {});
    assert.equal(d.rows[0].label, 'B');
    const t = entryById('best-trader').run({ combined }, {});
    assert.equal(t.rows[0].label, 'A');
    const m = entryById('best-manager').run({ combined }, {});
    assert.equal(m.rows[0].label, 'B');
});

test('llmRoute: catalog covers queries with params; validatePick sanitizes', () => {
    const cat = buildCatalog(ENTRIES);
    assert.ok(cat.find((c) => c.id === 'player-points')?.params.includes('topN'));
    const pick = validatePick({ entryId: 'player-points', params: { season: 2025, topN: 999, pos: 'K', bogus: 1 } }, ENTRIES, []);
    assert.equal(pick.entry.id, 'player-points');
    assert.deepEqual(pick.params, { season: 2025, topN: 50 });
    assert.equal(validatePick({ entryId: 'nope', params: {} }, ENTRIES, []), null);
    assert.equal(validatePick(null, ENTRIES, []), null);
});

test('Jake phrasings: drafting questions reach best-drafter, not the player board or a page card', () => {
    assert.equal(matchEntry(ENTRIES, 'Who drafts well', CTX)?.entry.id, 'best-drafter');
    assert.equal(matchEntry(ENTRIES, 'Who drafts the best players', CTX)?.entry.id, 'best-drafter');
    assert.equal(matchEntry(ENTRIES, 'Who are the best players in 2025?', CTX)?.entry.id, 'player-points');
    assert.equal(matchEntry(ENTRIES, 'show me the draft boards', CTX)?.entry.id, 'page-drafts');
});

test('router catalog carries blurbs and example asks so the model can route freeform', () => {
    const cat = buildCatalog(ENTRIES);
    const drafter = cat.find((c) => c.id === 'best-drafter');
    assert.ok(drafter.blurb && drafter.blurb.length > 10);
    assert.ok(Array.isArray(drafter.asksLike) && drafter.asksLike.length > 0);
    const page = cat.find((c) => c.id === 'page-drafts');
    assert.ok(page.blurb && !('asksLike' in page));
});

test('validatePicks: multi-pick, legacy shape, dedupe and the 3-pick cap', () => {
    const multi = validatePicks({ picks: [{ entryId: 'luck' }, { entryId: 'best-drafter' }] }, ENTRIES, ['Jake']);
    assert.deepEqual(multi.map((p) => p.entry.id), ['luck', 'best-drafter']);
    const legacy = validatePicks({ entryId: 'luck', params: { season: 2025 } }, ENTRIES, ['Jake']);
    assert.equal(legacy.length, 1);
    assert.equal(legacy[0].params.season, 2025);
    const capped = validatePicks({ picks: [{ entryId: 'luck' }, { entryId: 'luck' }, { entryId: 'best-drafter' }, { entryId: 'best-trader' }, { entryId: 'player-points' }] }, ENTRIES, ['Jake']);
    assert.deepEqual(capped.map((p) => p.entry.id), ['luck', 'best-drafter', 'best-trader']);
    assert.deepEqual(validatePicks({ picks: [{ entryId: 'nope' }] }, ENTRIES, ['Jake']), []);
    assert.deepEqual(validatePicks(null, ENTRIES, ['Jake']), []);
});

test('narration grounding: prose may restate figures, never invent them', () => {
    const source = 'Player scoring, 2025 — starter points only\nJonathan Taylor: 325.90 (RB)';
    assert.equal(narrationIsGrounded('Taylor tops 2025 with 325.90 points.', source), true);
    assert.equal(narrationIsGrounded('Taylor tops the board with about 326 points.', source), true);
    assert.equal(narrationIsGrounded('Taylor ran away with it, scoring 412.50.', source), false);
    assert.equal(narrationIsGrounded('A huge season from the RB1.', source), true);
});

test('mergeExtractedParams: question text fills what the router dropped, router wins conflicts', () => {
    assert.deepEqual(mergeExtractedParams({}, { season: 2025 }), { season: 2025 });
    assert.deepEqual(mergeExtractedParams({ season: 'all' }, { season: 2025 }), { season: 'all' });
    assert.deepEqual(mergeExtractedParams({ topN: 10 }, { season: 2025, topN: 15 }), { topN: 10, season: 2025 });
});

test('follow-ups: a bare param tweak follows up; a fresh question containing a param does not', () => {
    const last = { entry: ENTRIES.find((e) => e.id === 'player-points'), params: {} };
    const tweak = resolveTurn(ENTRIES, 'in 2024', CTX, last);
    assert.equal(tweak.followUp, true);
    assert.equal(tweak.params.season, 2024);
    const fresh = resolveTurn(ENTRIES, 'Who has drafted the best TEs and who has traded the best for WRs', CTX, last);
    assert.notEqual(fresh?.followUp, true);
});

test('validatePick: excludeCap is boolean-true only, and only where declared', () => {
    const bm = validatePick({ entryId: 'best-manager', params: { excludeCap: true } }, ENTRIES, []);
    assert.equal(bm.params.excludeCap, true);
    const sloppy = validatePick({ entryId: 'best-manager', params: { excludeCap: 'yes' } }, ENTRIES, []);
    assert.equal('excludeCap' in sloppy.params, false);
    const wrongEntry = validatePick({ entryId: 'player-points', params: { excludeCap: true } }, ENTRIES, []);
    assert.equal('excludeCap' in wrongEntry.params, false);
});

test('buildRoutePrompt: previous-answer context is included when present', () => {
    const withCtx = buildRoutePrompt('What if u exclude cap', [], ['Jake'], { entryId: 'best-manager', headline: 'Best all-around manager (average rank: cap, trades, draft)' });
    assert.ok(withCtx.includes('Previous answer: entry "best-manager"'));
    assert.ok(!buildRoutePrompt('Hi', [], [], null).includes('Previous answer'));
});

test('pickOutcome: plan beats picks, empty/invalid responses are null', () => {
    const plan = pickOutcome({ plan: { dataset: 'manager-leaderboard', rankBy: ['draft'] } }, ENTRIES, DATASETS, ['Jake']);
    assert.equal(plan.plan.dataset, 'manager-leaderboard');
    const picks = pickOutcome({ picks: [{ entryId: 'luck' }] }, ENTRIES, DATASETS, ['Jake']);
    assert.equal(picks.picks[0].entryId, 'luck');
    assert.equal(pickOutcome({ picks: [] }, ENTRIES, DATASETS, ['Jake']), null);
    assert.equal(pickOutcome({ plan: { dataset: 'nope' } }, ENTRIES, DATASETS, ['Jake']), null);
    assert.equal(pickOutcome(null, ENTRIES, DATASETS, ['Jake']), null);
});
