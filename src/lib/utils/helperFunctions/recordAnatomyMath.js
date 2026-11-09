// Pure aggregation math for the Record Anatomy page.
// No imports: this module is unit-testable outside the app.
//
// A "team-game" is one team's side of one matchup:
// {
//   season, week, rosterID, oppID, points, oppPoints, win (1 | 0.5 | 0),
//   groups:     { QB, RB, WR, TE }  // this team's starter points by position
//   oppGroups:  { QB, RB, WR, TE }  // the opponent's starter points by position
//   twentyPlus: number              // own starters scoring 20+ points
// }

export const GROUPS = ['QB', 'RB', 'WR', 'TE'];

// What counts as a positional group "going off" (season scoring context:
// these are the thresholds the league-wide splits are reported at).
export const GO_OFF = { QB: 25, RB: 45, WR: 45, TE: 18 };

export const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

const pearson = (xs, ys) => {
    const n = xs.length;
    if (n < 3) return 0;
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let cov = 0, vx = 0, vy = 0;
    for (let i = 0; i < n; i++) {
        cov += (xs[i] - mx) * (ys[i] - my);
        vx += (xs[i] - mx) ** 2;
        vy += (ys[i] - my) ** 2;
    }
    return vx && vy ? cov / Math.sqrt(vx * vy) : 0;
};

const winPctOf = (games) => games.length ? games.reduce((s, g) => s + g.win, 0) / games.length : 0;

// Aggregate team-games into team-seasons: { "2026-5": {...} }
export const buildTeamSeasons = (games) => {
    const seasons = {};
    for (const g of games) {
        const key = `${g.season}-${g.rosterID}`;
        if (!seasons[key]) {
            seasons[key] = {
                season: g.season, rosterID: g.rosterID, games: 0, wins: 0,
                pointsFor: 0, pointsAgainst: 0,
                groups: { QB: 0, RB: 0, WR: 0, TE: 0 },
                oppGroups: { QB: 0, RB: 0, WR: 0, TE: 0 },
                faced: [], facedGames: [], expectedWins: 0,
            };
        }
        const ts = seasons[key];
        ts.games++;
        ts.wins += g.win;
        ts.pointsFor += g.points;
        ts.pointsAgainst += g.oppPoints;
        for (const pos of GROUPS) {
            ts.groups[pos] += g.groups[pos] || 0;
            ts.oppGroups[pos] += g.oppGroups[pos] || 0;
        }
        ts.faced.push(g.oppID);
        ts.facedGames.push({ oppID: g.oppID, oppPoints: g.oppPoints });
    }
    return seasons;
};

// All-play expected wins: for every week, the share of the other teams in
// the league that this team's score would have beaten (ties count half).
// weekScores: { season: { week: [{ rosterID, points }] } }
export const addExpectedWins = (teamSeasons, weekScores) => {
    for (const season in weekScores) {
        for (const week in weekScores[season]) {
            const scores = weekScores[season][week];
            for (const mine of scores) {
                const others = scores.filter((s) => s.rosterID !== mine.rosterID);
                if (!others.length) continue;
                const share = others.reduce((sum, o) => sum + (mine.points > o.points ? 1 : mine.points === o.points ? 0.5 : 0), 0) / others.length;
                const ts = teamSeasons[`${season}-${mine.rosterID}`];
                if (ts) ts.expectedWins += share;
            }
        }
    }
    return teamSeasons;
};

// SOS (both flavors) + league ranks, computed within each season.
export const addSosAndRanks = (teamSeasons) => {
    const bySeason = {};
    for (const key in teamSeasons) {
        const ts = teamSeasons[key];
        (bySeason[ts.season] = bySeason[ts.season] || []).push(ts);
    }
    const rankDesc = (list, value) => 1 + list.filter((v) => v > value).length;
    for (const season in bySeason) {
        const teams = bySeason[season];
        const lookup = {};
        for (const ts of teams) lookup[ts.rosterID] = ts;
        // Per-game rates first: SOS reads every opponent's rates, so they
        // must all exist before any SOS value is computed.
        for (const ts of teams) {
            ts.pfPerGame = ts.games ? ts.pointsFor / ts.games : 0;
            ts.paPerGame = ts.games ? ts.pointsAgainst / ts.games : 0;
            ts.winPct = ts.games ? ts.wins / ts.games : 0;
            ts.luck = ts.wins - ts.expectedWins;
        }
        for (const ts of teams) {
            ts.sosPts = ts.faced.length
                ? ts.faced.reduce((sum, oppID) => sum + (lookup[oppID] ? lookup[oppID].pfPerGame : 0), 0) / ts.faced.length
                : 0;
            ts.sosRec = ts.faced.length
                ? ts.faced.reduce((sum, oppID) => sum + (lookup[oppID] ? lookup[oppID].winPct : 0), 0) / ts.faced.length
                : 0;
        }
        const allPf = teams.map((t) => t.pfPerGame);
        const allPa = teams.map((t) => t.paPerGame);
        const allSosPts = teams.map((t) => t.sosPts);
        for (const ts of teams) {
            let diffSum = 0, diffN = 0;
            for (const fg of ts.facedGames) {
                const opp = lookup[fg.oppID];
                if (!opp || opp.games < 2) continue;
                diffSum += fg.oppPoints - (opp.pointsFor - fg.oppPoints) / (opp.games - 1);
                diffN++;
            }
            ts.scheduleLuck = diffN ? -(diffSum / diffN) + 0 : 0; // +0 normalizes -0
        }
        const allSosRec = teams.map((t) => t.sosRec);
        const allSchedLuck = teams.map((t) => t.scheduleLuck);
        // League-average positional scoring, the baseline for edge numbers.
        const leagueGroups = {};
        for (const pos of GROUPS) {
            leagueGroups[pos] = teams.reduce((sum, t) => sum + (t.games ? t.groups[pos] / t.games : 0), 0) / teams.length;
        }
        for (const ts of teams) {
            ts.pfRank = rankDesc(allPf, ts.pfPerGame);
            ts.paRank = rankDesc(allPa, ts.paPerGame);
            ts.sosPtsRank = rankDesc(allSosPts, ts.sosPts);
            ts.sosRecRank = rankDesc(allSosRec, ts.sosRec);
            ts.scheduleLuckRank = rankDesc(allSchedLuck, ts.scheduleLuck);
            ts.edges = {};
            for (const pos of GROUPS) {
                ts.edges[pos] = (ts.games ? ts.groups[pos] / ts.games : 0) - leagueGroups[pos];
            }
        }
    }
    return teamSeasons;
};

// League-wide "laws": correlations per season, positional go-off splits,
// and the 20+ scorers ladder.
export const computeLaws = (games, teamSeasons) => {
    const seasons = [...new Set(games.map((g) => g.season))].sort();
    const correlations = [];
    const pooled = { winPct: [], pf: [], pa: [] };
    for (const season of seasons) {
        const teams = Object.values(teamSeasons).filter((t) => t.season === season);
        const winPct = teams.map((t) => t.winPct);
        const pf = teams.map((t) => t.pfPerGame);
        const pa = teams.map((t) => t.paPerGame);
        correlations.push({ season, pf: round2(pearson(winPct, pf)), pa: round2(pearson(winPct, pa)) });
        pooled.winPct.push(...winPct); pooled.pf.push(...pf); pooled.pa.push(...pa);
    }
    correlations.push({ season: 'All', pf: round2(pearson(pooled.winPct, pooled.pf)), pa: round2(pearson(pooled.winPct, pooled.pa)) });

    const splitFor = (list, pos, key = 'oppGroups') => {
        const hi = list.filter((g) => (g[key][pos] || 0) >= GO_OFF[pos]);
        const lo = list.filter((g) => (g[key][pos] || 0) < GO_OFF[pos]);
        return {
            pos, threshold: GO_OFF[pos],
            hiWinPct: round2(winPctOf(hi) * 100), hiN: hi.length,
            loWinPct: round2(winPctOf(lo) * 100), loN: lo.length,
        };
    };
    const splits = GROUPS.map((pos) => splitFor(games, pos, 'groups'));
    const splitsBySeason = seasons.map((season) => ({
        season,
        splits: GROUPS.map((pos) => {
            const inSeason = games.filter((g) => g.season === season && (g.groups[pos] || 0) >= GO_OFF[pos]);
            return { pos, winPct: round2(winPctOf(inSeason) * 100), n: inSeason.length };
        }),
    }));

    const wins = games.filter((g) => g.win === 1);
    const losses = games.filter((g) => g.win === 0);
    const buckets = [[0, 1], [2, 2], [3, 3], [4, Infinity]];
    const ladder = buckets.map(([lo, hi]) => {
        const inBucket = games.filter((g) => g.twentyPlus >= lo && g.twentyPlus <= hi);
        return {
            label: hi === Infinity ? '4+' : lo === hi ? `${lo}` : `${lo}–${hi}`,
            winPct: round2(winPctOf(inBucket) * 100), n: inBucket.length,
        };
    });

    return {
        correlations, splits, splitsBySeason, ladder,
        avgTwentyInWins: round2(wins.reduce((s, g) => s + g.twentyPlus, 0) / Math.max(wins.length, 1)),
        avgTwentyInLosses: round2(losses.reduce((s, g) => s + g.twentyPlus, 0) / Math.max(losses.length, 1)),
        teamGames: games.length,
    };
};

// One team's splits for the drill-down: record in games where a group
// (theirs or the opponent's) went off, plus their own 20+ ladder.
export const computePersonalSplits = (games, season, rosterID) => {
    const mine = games.filter((g) => g.season === season && g.rosterID === rosterID);
    const record = (list) => ({
        w: list.filter((g) => g.win === 1).length,
        l: list.filter((g) => g.win === 0).length,
        t: list.filter((g) => g.win === 0.5).length,
        n: list.length,
    });
    const rows = [];
    for (const pos of GROUPS) rows.push({ label: `Your ${pos} goes off (${GO_OFF[pos]}+)`, ...record(mine.filter((g) => (g.groups[pos] || 0) >= GO_OFF[pos])) });
    for (const pos of GROUPS) rows.push({ label: `Their ${pos} goes off (${GO_OFF[pos]}+)`, ...record(mine.filter((g) => (g.oppGroups[pos] || 0) >= GO_OFF[pos])) });
    const ladder = [[0, 1], [2, 2], [3, 3], [4, Infinity]].map(([lo, hi]) => ({
        label: hi === Infinity ? '4+' : lo === hi ? `${lo}` : `${lo}–${hi}`,
        ...record(mine.filter((g) => g.twentyPlus >= lo && g.twentyPlus <= hi)),
    }));
    return { rows, ladder };
};
