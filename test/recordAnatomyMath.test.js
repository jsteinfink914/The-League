import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeamSeasons, addExpectedWins, addSosAndRanks, computeLaws } from '../src/lib/utils/helperFunctions/recordAnatomyMath.js';

// Games in the exact shape recordAnatomy.js produces: `groups` is the team's
// OWN starter points by position, `oppGroups` is the opponent's. Two teams,
// two weeks. Roster 1's RBs go off in week 1 (50) and flop in week 2 (20);
// roster 2's RBs do the opposite (10, then 60).
const G = { QB: 10, RB: 0, WR: 20, TE: 5 };
const games = [
    { season: 2026, week: 1, rosterID: 1, oppID: 2, points: 100, oppPoints: 90, win: 1, groups: { ...G, RB: 50 }, oppGroups: { ...G, RB: 10 }, twentyPlus: 2 },
    { season: 2026, week: 1, rosterID: 2, oppID: 1, points: 90, oppPoints: 100, win: 0, groups: { ...G, RB: 10 }, oppGroups: { ...G, RB: 50 }, twentyPlus: 1 },
    { season: 2026, week: 2, rosterID: 1, oppID: 2, points: 80, oppPoints: 95, win: 0, groups: { ...G, RB: 20 }, oppGroups: { ...G, RB: 60 }, twentyPlus: 0 },
    { season: 2026, week: 2, rosterID: 2, oppID: 1, points: 95, oppPoints: 80, win: 1, groups: { ...G, RB: 60 }, oppGroups: { ...G, RB: 20 }, twentyPlus: 3 },
];
const weekScores = {
    2026: {
        1: [{ rosterID: 1, points: 100 }, { rosterID: 2, points: 90 }],
        2: [{ rosterID: 1, points: 80 }, { rosterID: 2, points: 95 }],
    },
};

test('go-off splits read the team\'s OWN groups, not the opponent\'s', () => {
    const laws = computeLaws(games, {});
    const rb = laws.splits.find((s) => s.pos === 'RB');
    // Own RBs >= 45: roster 1 week 1 (win) and roster 2 week 2 (win).
    assert.equal(rb.hiN, 2);
    assert.equal(rb.hiWinPct, 100);
    assert.equal(rb.loN, 2);
    assert.equal(rb.loWinPct, 0);
    // By-season splits use the same own-group view.
    const season = laws.splitsBySeason.find((r) => r.season === 2026);
    const rbSeason = season.splits.find((s) => s.pos === 'RB');
    assert.equal(rbSeason.n, 2);
    assert.equal(rbSeason.winPct, 100);
});

test('20-point ladder buckets by own starters over 20', () => {
    const laws = computeLaws(games, {});
    const rung = (label) => laws.ladder.find((r) => r.label === label);
    assert.equal(rung('0–1').winPct, 0);
    assert.equal(rung('2').winPct, 100);
    assert.equal(rung('3').winPct, 100);
});

test('all-play expected wins and luck from week scores', () => {
    const ts = addSosAndRanks(addExpectedWins(buildTeamSeasons(games), weekScores));
    // Each team outscored the other in exactly one of the two weeks.
    assert.equal(ts['2026-1'].expectedWins, 1);
    assert.equal(ts['2026-2'].expectedWins, 1);
    assert.equal(ts['2026-1'].luck, 0);
    assert.equal(ts['2026-2'].luck, 0);
});

test('schedule luck: opponent scoring vs their own average, sign-flipped', () => {
    const G = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const game = (rosterID, points, oppID, oppPoints, win) => ({
        season: 2026, rosterID, points, oppID, oppPoints, win, groups: { ...G }, oppGroups: { ...G },
    });
    // R1 beats R2 100-80, then loses 90-130. R2's two scores vs R1 are 80 and
    // 130; against its excl-game averages (130 and 80) that's -50 and +50 for
    // R2's scoring, so R1's luck is -(+... ) -> diffs for R1: (80-130) and
    // (130-80) = -50/+50 -> luck 0. R2's diffs: (100-90) and (90-100) = +10/-10 -> 0.
    // Asymmetric check below uses a third game.
    const games = [
        game(1, 100, 2, 80, 1), game(2, 80, 1, 100, 0),
        game(1, 90, 2, 130, 0), game(2, 130, 1, 90, 1),
        game(1, 110, 2, 60, 1), game(2, 60, 1, 110, 0),
    ];
    const ts = addSosAndRanks(buildTeamSeasons(games));
    // R2 totals 270 over 3 games. R1's diffs: 80-(270-80)/2=-15, 130-(270-130)/2=+60,
    // 60-(270-60)/2=-45 -> mean 0 -> luck 0.
    assert.equal(ts['2026-1'].scheduleLuck, 0);
    // R1 totals 300. R2's diffs: 100-(300-100)/2=0, 90-(300-90)/2=-15, 110-(300-110)/2=+15 -> 0.
    assert.equal(ts['2026-2'].scheduleLuck, 0);
});

test('schedule luck: a team whose opponents no-show gets positive luck and rank 1', () => {
    const G = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const game = (rosterID, points, oppID, oppPoints, win) => ({
        season: 2026, rosterID, points, oppID, oppPoints, win, groups: { ...G }, oppGroups: { ...G },
    });
    // R2 scores 140 and 140 against R3 but only 60 against R1.
    const games = [
        game(1, 100, 2, 60, 1), game(2, 60, 1, 100, 0),
        game(2, 140, 3, 100, 1), game(3, 100, 2, 140, 0),
        game(2, 140, 3, 110, 1), game(3, 110, 2, 140, 0),
    ];
    const ts = addSosAndRanks(buildTeamSeasons(games));
    // R1's only game: R2 scored 60 vs its excl-game average of 140 -> luck +80.
    assert.equal(ts['2026-1'].scheduleLuck, 80);
    assert.equal(ts['2026-1'].scheduleLuckRank, 1);
});

import { goOffSplit } from '../src/lib/utils/helperFunctions/recordAnatomyMath.js';

test('goOffSplit: arbitrary thresholds recompute the split', () => {
    const G = (rb) => ({ QB: 0, RB: rb, WR: 0, TE: 0 });
    const games = [
        { season: 2026, rosterID: 1, win: 1, groups: G(50), oppGroups: G(0) },
        { season: 2026, rosterID: 2, win: 0, groups: G(47), oppGroups: G(0) },
        { season: 2026, rosterID: 3, win: 1, groups: G(44), oppGroups: G(0) },
        { season: 2026, rosterID: 4, win: 0.5, groups: G(30), oppGroups: G(0) },
    ];
    const at45 = goOffSplit(games, 'RB', 45);
    assert.equal(at45.hiN, 2);
    assert.equal(at45.hiWinPct, 50); // 1 win in 2 games
    assert.equal(at45.loN, 2);
    assert.equal(at45.loWinPct, 75); // win + tie(0.5) in 2 games
    const at50 = goOffSplit(games, 'RB', 50);
    assert.equal(at50.hiN, 1);
    assert.equal(at50.hiWinPct, 100);
    const at51 = goOffSplit(games, 'RB', 51);
    assert.equal(at51.hiN, 0);
    assert.equal(at51.hiWinPct, 0);
});
