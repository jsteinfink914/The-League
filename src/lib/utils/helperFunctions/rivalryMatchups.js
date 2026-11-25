import { getLeagueData } from "./leagueData"
import { leagueID } from '$lib/utils/leagueInfo';
import { getNflState } from "./nflState"
import { waitForAll } from './multiPromise';
import { fetchJson, allSettledWithConcurrency } from './request';
import { getRosterIDFromManagerIDAndYear } from '$lib/utils/helperFunctions/universalFunctions';
import { getLeagueTeamManagers } from "./leagueTeamManagers";

// Session-level memo per pair: a pair's history only changes when new
// games complete, and the fetch behind it spans every season.
const rivalryCache = new Map();
export const getRivalryMatchups = async (userOneID, userTwoID) => {
    if(!userOneID || !userTwoID) {
        return;
    }
    const cacheKey = `${userOneID}|${userTwoID}`;
    if(!rivalryCache.has(cacheKey)) {
        rivalryCache.set(cacheKey, computeRivalryMatchups(userOneID, userTwoID).catch((err) => { rivalryCache.delete(cacheKey); throw err; }));
    }
    return rivalryCache.get(cacheKey);
};

const computeRivalryMatchups = async (userOneID, userTwoID) => {

    let curLeagueID = leagueID;

	const [nflState, teamManagers] = await waitForAll(
		getNflState(),
		getLeagueTeamManagers(),
	).catch((err) => { console.error(err); });

	let week = 1;
	if(nflState.season_type == 'regular') {
		week = nflState.display_week;
	} else if(nflState.season_type == 'post') {
		week = 18;
	}

    const rivalry = {
        points: {
            one: 0,
            two: 0,
        },
        wins: {
            one: 0,
            two: 0,
        },
        ties: 0,
        matchups: []
    }

    // Walk the league chain first (league data is store-cached), collecting
    // each season's context; then fetch every season's matchup weeks
    // through one pooled queue instead of draining season by season.
    const seasonContexts = [];
    while(curLeagueID && curLeagueID != 0) {
        const leagueData = await getLeagueData(curLeagueID).catch((err) => { console.error(err); });
        const year = leagueData.season;
        const rosterIDOne = getRosterIDFromManagerIDAndYear(teamManagers, userOneID, year);
        const rosterIDTwo = getRosterIDFromManagerIDAndYear(teamManagers, userTwoID, year);
        seasonContexts.push({ seasonLeagueID: curLeagueID, leagueData, year, rosterIDOne, rosterIDTwo });
        curLeagueID = leagueData.previous_league_id;
        week = 18;
    }

    const weekTasks = [];
    const weekMeta = [];
    for(const ctx of seasonContexts) {
        if(!ctx.rosterIDOne || !ctx.rosterIDTwo || ctx.rosterIDOne == ctx.rosterIDTwo) continue;
        for(let i = 1; i < ctx.leagueData.settings.playoff_week_start; i++) {
            weekTasks.push(() => fetchJson(`https://api.sleeper.app/v1/league/${ctx.seasonLeagueID}/matchups/${i}`, { compress: true }));
            weekMeta.push({ ctx, week: i });
        }
    }
    const weekResults = await allSettledWithConcurrency(weekTasks, 10);
    const matchupsByContext = new Map();
    weekResults.forEach((result, idx) => {
        const { ctx, week: weekNum } = weekMeta[idx];
        if(!matchupsByContext.has(ctx)) matchupsByContext.set(ctx, []);
        // A failed week degrades to a skipped week (the old code crashed the
        // whole lookup when any single week's fetch failed).
        matchupsByContext.get(ctx).push({ week: weekNum, entries: result.status === 'fulfilled' ? result.value : null });
    });

    for(const ctx of seasonContexts) {
        if(!ctx.rosterIDOne || !ctx.rosterIDTwo || ctx.rosterIDOne == ctx.rosterIDTwo) continue;
        const weeks = (matchupsByContext.get(ctx) || []).sort((a, b) => a.week - b.week);
        for(const { week: weekNum, entries } of weeks) {
            const processed = processRivalryMatchups(entries, weekNum, ctx.rosterIDOne, ctx.rosterIDTwo);
            if(processed) {
                const {matchup, week} = processed;
                const sideA = matchup[0];
                const sideB = matchup[1];
                let sideAPoints = sideA.points.reduce((t, nV) => t + nV, 0);
                let sideBPoints = sideB.points.reduce((t, nV) => t + nV, 0);
                rivalry.points.one += sideAPoints;
                rivalry.points.two += sideBPoints;
                if(sideAPoints > sideBPoints) {
                    rivalry.wins.one++;
                } else if(sideAPoints < sideBPoints) {
                    rivalry.wins.two++;
                } else {
                    rivalry.ties++;
                }
                rivalry.matchups.push({
                    week,
                    year: ctx.year,
                    matchup,
                })
            }
        }
    }

    rivalry.matchups.sort((a, b) => {
        var yearOrder = b.year - a.year;
        var weekOrder = b.week - a.week;
        return yearOrder || weekOrder;
    });

	return rivalry;
}

const processRivalryMatchups = (inputMatchups, week, rosterIDOne, rosterIDTwo) => {
	if(!inputMatchups || inputMatchups.length == 0) {
		return false;
	}
	const matchups = {};
	for(const match of inputMatchups) {
        if(match.roster_id == rosterIDOne || match.roster_id == rosterIDTwo) {
            if(!matchups[match.matchup_id]) {
                matchups[match.matchup_id] = [];
            }
            matchups[match.matchup_id].push({
                roster_id: match.roster_id,
                starters: match.starters,
                points: match.starters_points,
            })
        }
	}
    const keys = Object.keys(matchups);
    const matchup = matchups[keys[0]];
    // if the two teams played each other, there will only be one matchup, or if
    // there is one matchup that only has half the matchup, then one of the teams wasn't in the league yet
    if(keys.length > 1 || matchup.length == 1) {
        return;
    }
    // make sure that the order matches
    if(matchup[0].roster_id == rosterIDTwo) {
        const two = matchup.shift();
        matchup.push(two);
    }
	return {matchup, week};
}
