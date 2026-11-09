// Pure standings math, split out of leagueStandings.js so it can be unit
// tested (leagueStandings itself needs the network and Svelte stores).
// Everything here works in raw numbers — display formatting (decimals,
// ranks in parentheses, + signs) happens at render time in the page.

export const roundTo = (value, decimals) => {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
};

// All-play expected wins: for every week, a team earns the share of the
// other teams in the league that its score would have beaten (ties half).
// weekScores: an array of weeks, each a list of { rosterID, points }.
export const expectedWinsByRoster = (weekScores) => {
    const expectedWins = {};
    for (const scores of weekScores || []) {
        for (const mine of scores) {
            const others = scores.filter((s) => s.rosterID !== mine.rosterID);
            if (!others.length) continue;
            const share = others.reduce((sum, o) => sum + (mine.points > o.points ? 1 : mine.points === o.points ? 0.5 : 0), 0) / others.length;
            expectedWins[mine.rosterID] = (expectedWins[mine.rosterID] || 0) + share;
        }
    }
    return expectedWins;
};

// Luck: actual wins (ties count half) minus all-play expected wins,
// rounded to one decimal. Positive = running hot.
export const luckValue = (wins, ties, expectedWins) =>
    roundTo((wins || 0) + 0.5 * (ties || 0) - (expectedWins || 0), 1);

// Strength of schedule, two flavors, both averaged over the opponents each
// team has faced (facing an opponent twice counts them twice):
//   sos:       the faced opponents' average weekly score
//   sosRecord: the faced opponents' combined win percentage
// Returns { [rosterID]: { sos, sosRank, sosRecord, sosRecordRank } } with
// raw numeric values; rank 1 = toughest schedule, ties share a rank.
// standings: { [rosterID]: { wins, losses, ties } }
// scheduleInfo: { points: {rosterID: total}, games: {rosterID: n}, faced: {rosterID: [oppID, ...]} }
export const sosValues = (standings, scheduleInfo) => {
    const winPct = (s) => {
        const played = (s.wins || 0) + (s.losses || 0) + (s.ties || 0);
        return played ? ((s.wins || 0) + 0.5 * (s.ties || 0)) / played : 0;
    };
    const sosRaw = {}, sosRecRaw = {};
    for (const rosterID in standings) {
        const faced = scheduleInfo.faced[rosterID] || [];
        if (!faced.length) continue;
        const oppPpgTotal = faced.reduce((sum, oppID) => sum + (scheduleInfo.games[oppID] ? scheduleInfo.points[oppID] / scheduleInfo.games[oppID] : 0), 0);
        sosRaw[rosterID] = oppPpgTotal / faced.length;
        const oppWinPctTotal = faced.reduce((sum, oppID) => sum + (standings[oppID] ? winPct(standings[oppID]) : 0), 0);
        sosRecRaw[rosterID] = oppWinPctTotal / faced.length;
    }
    const rankOf = (raw, rosterID) => 1 + Object.values(raw).filter((v) => v > raw[rosterID]).length;
    const result = {};
    for (const rosterID in sosRaw) {
        result[rosterID] = {
            sos: roundTo(sosRaw[rosterID], 2),
            sosRank: rankOf(sosRaw, rosterID),
            sosRecord: roundTo(sosRecRaw[rosterID], 3),
            sosRecordRank: rankOf(sosRecRaw, rosterID),
        };
    }
    return result;
};

// Schedule luck: for each game, the opponent's score in that game minus the
// opponent's season average (excluding that game). Averaged over the team's
// games and sign-flipped, so positive means opponents underperformed against
// this team (lucky) and negative means they brought their best (unlucky).
// Points per game, one decimal. Rank 1 = luckiest, ties share a rank.
// weekScores: an array of weeks, each a list of { rosterID, points }.
// faced: { rosterID: [oppID, ...] } in the order the games were played —
// weekScores[i] must be the week of the i-th faced entry (leagueStandings
// builds both in the same pass over the same matchup weeks, and every team
// plays every week in this league).
export const scheduleLuckValues = (weekScores, faced) => {
    const totals = {}, counts = {}, byWeek = [];
    for (const week of weekScores || []) {
        const map = {};
        for (const e of week) {
            map[e.rosterID] = e.points;
            totals[e.rosterID] = (totals[e.rosterID] || 0) + e.points;
            counts[e.rosterID] = (counts[e.rosterID] || 0) + 1;
        }
        byWeek.push(map);
    }
    const raw = {};
    for (const rosterID in faced || {}) {
        let sum = 0, n = 0;
        (faced[rosterID] || []).forEach((oppID, i) => {
            const oppGamePts = byWeek[i] ? byWeek[i][oppID] : undefined;
            if (oppGamePts === undefined || (counts[oppID] || 0) < 2) return;
            const oppAvgExcl = (totals[oppID] - oppGamePts) / (counts[oppID] - 1);
            sum += oppGamePts - oppAvgExcl;
            n++;
        });
        raw[rosterID] = n ? -(sum / n) : 0;
    }
    const result = {};
    for (const rosterID in raw) {
        result[rosterID] = {
            sosLuck: roundTo(raw[rosterID], 1),
            sosLuckRank: 1 + Object.values(raw).filter((v) => v > raw[rosterID]).length,
        };
    }
    return result;
};
