import { leagueID } from '$lib/utils/leagueInfo';
import { allSettledWithConcurrency, fetchJson } from './request';
import { getNflState } from './nflState';
import { loadPlayers } from './players';
import { GROUPS, buildTeamSeasons, addExpectedWins, addSosAndRanks, computeLaws } from './recordAnatomyMath';

// Data layer for the Record Anatomy page. Walks the league chain back to
// the first season, pulls every regular-season matchup, and reduces it to
// team-games (one team's side of one matchup) that the math module in
// recordAnatomyMath.js aggregates into league laws and per-team anatomy.

async function collectSeasonChain() {
    const seasons = [];
    let curID = leagueID;
    while (curID && curID !== '0') {
        const data = await fetchJson(`https://api.sleeper.app/v1/league/${curID}`);
        seasons.push({
            year: Number(data.season),
            seasonID: curID,
            playoffWeekStart: data.settings?.playoff_week_start ?? 15,
            status: data.status,
        });
        const prev = data.previous_league_id;
        curID = prev && prev !== '0' ? prev : null;
    }
    return seasons; // newest first
}

async function fetchSeasonWeeks(seasonID, weekCount) {
    const urls = [];
    for (let w = 1; w <= weekCount; w++) {
        urls.push(`https://api.sleeper.app/v1/league/${seasonID}/matchups/${w}`);
    }
    const results = await allSettledWithConcurrency(urls.map((url) => () => fetchJson(url)));
    return results.map((result, i) => ({
        week: i + 1,
        entries: result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [],
    }));
}

const groupPoints = (entry, posMap) => {
    const groups = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const starters = entry.starters || [];
    const starterPts = entry.starters_points || [];
    starters.forEach((pid, idx) => {
        const pos = posMap[pid];
        if (pos && groups[pos] !== undefined) groups[pos] += starterPts[idx] || 0;
    });
    return groups;
};

export const getRecordAnatomy = async () => {
    const [chain, nflState, playersRes] = await Promise.all([
        collectSeasonChain(),
        getNflState().catch(() => null),
        loadPlayers().catch(() => null),
    ]);
    const players = playersRes?.players || {};
    const posMap = {};
    for (const pid in players) posMap[pid] = players[pid].pos || players[pid].position;

    const currentYear = chain[0].year;
    // Completed weeks in the current season; past seasons are final.
    let lastCompletedWeek = Infinity;
    if (nflState && `${nflState.season}` === `${currentYear}`) {
        if (nflState.season_type === 'regular') lastCompletedWeek = Math.max(nflState.week - 1, 0);
        else if (nflState.season_type === 'pre') lastCompletedWeek = 0;
    }

    const games = [];
    const weekScores = {};
    let upcoming = null;

    for (const season of chain) {
        const regularWeeks = season.playoffWeekStart - 1;
        const isCurrent = season.year === currentYear;
        const completedThrough = isCurrent ? Math.min(lastCompletedWeek, regularWeeks) : regularWeeks;
        // For the current season also fetch the next week's pairings (danger board).
        const fetchThrough = isCurrent ? Math.min(completedThrough + 1, regularWeeks) : regularWeeks;
        const weeks = await fetchSeasonWeeks(season.seasonID, fetchThrough);
        weekScores[season.year] = {};

        for (const { week, entries } of weeks) {
            if (!entries.length) continue;
            if (isCurrent && week === completedThrough + 1 && week <= regularWeeks) {
                const pairs = {};
                for (const e of entries) (pairs[e.matchup_id] = pairs[e.matchup_id] || []).push(e.roster_id);
                const pairList = Object.values(pairs).filter((p) => p.length === 2).map(([a, b]) => ({ a, b }));
                if (pairList.length) upcoming = { season: season.year, week, pairs: pairList };
                continue;
            }
            if (week > completedThrough) continue;
            weekScores[season.year][week] = entries.map((e) => ({ rosterID: e.roster_id, points: e.points || 0 }));
            const pairs = {};
            for (const e of entries) (pairs[e.matchup_id] = pairs[e.matchup_id] || []).push(e);
            for (const duo of Object.values(pairs)) {
                if (duo.length !== 2) continue;
                for (const [me, opp] of [[duo[0], duo[1]], [duo[1], duo[0]]]) {
                    games.push({
                        season: season.year,
                        week,
                        rosterID: me.roster_id,
                        oppID: opp.roster_id,
                        points: me.points || 0,
                        oppPoints: opp.points || 0,
                        win: me.points > opp.points ? 1 : me.points === opp.points ? 0.5 : 0,
                        groups: groupPoints(me, posMap),
                        oppGroups: groupPoints(opp, posMap),
                        twentyPlus: (me.starters_points || []).filter((p) => (p || 0) >= 20).length,
                    });
                }
            }
        }
    }

    const teamSeasons = addSosAndRanks(addExpectedWins(buildTeamSeasons(games), weekScores));
    const laws = computeLaws(games, teamSeasons);

    return {
        games,
        teamSeasons,
        laws,
        upcoming,
        seasons: chain.map((s) => s.year).sort((a, b) => b - a),
        currentYear,
        groups: GROUPS,
    };
};
