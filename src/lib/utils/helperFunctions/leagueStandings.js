import { leagueID } from '$lib/utils/leagueInfo';
import { getNflState } from "./nflState"
import { getLeagueData } from "./leagueData"
import { getLeagueRosters } from "./leagueRosters"
import { waitForAll } from './multiPromise';
import { get } from 'svelte/store';
import {standingsStore} from '$lib/stores';
import { round } from './universalFunctions';

export const getLeagueStandings = async () => {
	if(get(standingsStore).standingsInfo) {
		return get(standingsStore);
	}

	const [nflState, leagueData, rostersData] = await waitForAll(
		getNflState(),
		getLeagueData(),
		getLeagueRosters(),
	).catch((err) => { console.error(err); });

	const yearData = leagueData.season;
	const regularSeasonLength = leagueData.settings.playoff_week_start - 1;
	const divisions = leagueData.settings.divisions && leagueData.settings.divisions > 1;
    const rosters = rostersData.rosters;

	// if the season hasn't started, standings can't be created
	if((leagueData.status != "in_season" && leagueData.status != "post_season" && leagueData.status != "complete") || nflState.week < 1) {
		return null;
	}

	let standings = {};
    for(const rosterID in rosters) {
        const roster = rosters[rosterID];
        standings[rosterID] = {
            rosterID,
            wins: roster.settings.wins,
            losses: roster.settings.losses,
            ties: roster.settings.ties,
            fpts: round(roster.settings.fpts + (roster.settings.fpts_decimal / 100)),
            fptsAgainst: round(roster.settings.fpts_against + (roster.settings.fpts_against_decimal / 100)),
            sos: 0,
            sosRecord: 0,
            luck: 0,
            streak: roster.metadata?.streak || 0,
            divisionWins: divisions ? 0 : null,
            divisionLosses: divisions ? 0 : null,
            divisionTies: divisions ? 0 : null,
        }
    }

    if(divisions) {
        let week = 0;
        if(nflState.season_type == 'regular') {
            // max the week out at end of regular season
            week = nflState.display_week > regularSeasonLength ? regularSeasonLength + 1 : nflState.display_week;
        } else if(nflState.season_type == 'post') {
            week = regularSeasonLength + 1;
        }

        // if at least one week hasn't been completed, then standings can't be created
        if(week < 2) {
            return null;
        }

        // pull in all matchup data for the season
        const matchupsPromises = [];
        for(let i = week - 1; i > 0; i--) {
            matchupsPromises.push(fetch(`https://api.sleeper.app/v1/league/${leagueID}/matchups/${i}`, {compress: true}))
        }
        const matchupsRes = await waitForAll(...matchupsPromises);

        // convert the json matchup responses
        const matchupsJsonPromises = [];
        for(const matchupRes of matchupsRes) {
            const data = matchupRes.json();
            matchupsJsonPromises.push(data)
            if (!matchupRes.ok) {
                throw new Error(data);
            }
        }
        const matchupsData = await waitForAll(...matchupsJsonPromises).catch((err) => { console.error(err); }).catch((err) => { console.error(err); });

        // process all the matchups
        const scheduleInfo = { points: {}, games: {}, faced: {} };
        for(const matchup of matchupsData) {
            standings = processStandings(matchup, standings, rosters, scheduleInfo);
        }

        // Strength of schedule, two flavors, both averaged over the opponents
        // each team has faced this season (facing an opponent twice counts
        // them twice). Higher means a tougher slate of opponents either way.
        //   sos:       the faced opponents' average weekly score
        //   sosRecord: the faced opponents' combined win percentage
        const winPct = (s) => {
            const played = (s.wins || 0) + (s.losses || 0) + (s.ties || 0);
            return played ? ((s.wins || 0) + 0.5 * (s.ties || 0)) / played : 0;
        };
        const sosRaw = {}, sosRecRaw = {};
        for(const rosterID in standings) {
            const faced = scheduleInfo.faced[rosterID] || [];
            if(faced.length) {
                const oppPpgTotal = faced.reduce((sum, oppID) => sum + (scheduleInfo.games[oppID] ? scheduleInfo.points[oppID] / scheduleInfo.games[oppID] : 0), 0);
                sosRaw[rosterID] = oppPpgTotal / faced.length;
                const oppWinPctTotal = faced.reduce((sum, oppID) => sum + (standings[oppID] ? winPct(standings[oppID]) : 0), 0);
                sosRecRaw[rosterID] = oppWinPctTotal / faced.length;
            }
        }
        // League rank for each flavor (1 = toughest schedule; ties share a rank),
        // shown in parentheses next to the value.
        const rankOf = (raw, rosterID) => 1 + Object.values(raw).filter(v => v > raw[rosterID]).length;
        for(const rosterID in sosRaw) {
            standings[rosterID].sos = `${round(sosRaw[rosterID])} (${rankOf(sosRaw, rosterID)})`;
            standings[rosterID].sosRecord = `${(Math.round((sosRecRaw[rosterID] + Number.EPSILON) * 1000) / 1000).toFixed(3)} (${rankOf(sosRecRaw, rosterID)})`;
        }

        // Luck: actual wins (ties count half) minus all-play expected wins.
        // For every week, a team earns the share of the other teams in the
        // league that its score would have beaten (ties half); the weekly
        // shares sum to expected wins. Positive luck = running hot.
        const expectedWins = {};
        for(const weekScores of (scheduleInfo.weekScores || [])) {
            for(const mine of weekScores) {
                const others = weekScores.filter((s) => s.rosterID !== mine.rosterID);
                if(!others.length) continue;
                const share = others.reduce((sum, o) => sum + (mine.points > o.points ? 1 : mine.points === o.points ? 0.5 : 0), 0) / others.length;
                expectedWins[mine.rosterID] = (expectedWins[mine.rosterID] || 0) + share;
            }
        }
        for(const rosterID in standings) {
            const actualWins = (standings[rosterID].wins || 0) + 0.5 * (standings[rosterID].ties || 0);
            const luck = Math.round(((actualWins - (expectedWins[rosterID] || 0)) + Number.EPSILON) * 10) / 10;
            standings[rosterID].luck = `${luck > 0 ? '+' : ''}${luck.toFixed(1)}`;
        }
    }

	const response = {
		standingsInfo: standings,
		yearData,
	}
	
	standingsStore.update(() => response);

	return response;
}

const processStandings = (matchup, standingsData, rosters, scheduleInfo) => {
	const matchups = {};
	for(const match of matchup) {
		if(!matchups[match.matchup_id]) {
			matchups[match.matchup_id] = [];
		}
		const rosterID = match.roster_id;

		matchups[match.matchup_id].push({
			rosterID,
			division: rosters[rosterID].settings.division,
			points: match.points,
		})
	}

	if(scheduleInfo) {
		(scheduleInfo.weekScores = scheduleInfo.weekScores || []).push(matchup.map((m) => ({ rosterID: m.roster_id, points: m.points || 0 })));
	}

	for(const matchupKey in matchups) {
		const teamA = matchups[matchupKey][0];
		const teamB = matchups[matchupKey][1];

		if(teamB && scheduleInfo) {
			for(const [team, opp] of [[teamA, teamB], [teamB, teamA]]) {
				scheduleInfo.points[team.rosterID] = (scheduleInfo.points[team.rosterID] || 0) + team.points;
				scheduleInfo.games[team.rosterID] = (scheduleInfo.games[team.rosterID] || 0) + 1;
				(scheduleInfo.faced[team.rosterID] = scheduleInfo.faced[team.rosterID] || []).push(opp.rosterID);
			}
		}

		const divisionMatchup = teamA.division && teamB.division && teamA.division == teamB.division;

        if(divisionMatchup) {
            if(teamA.points > teamB.points) {
                standingsData[teamA.rosterID].divisionWins ++;
                standingsData[teamB.rosterID].divisionLosses ++;
                continue;
            } else if(teamB.points > teamA.points) {
                standingsData[teamB.rosterID].divisionWins ++;
                standingsData[teamA.rosterID].divisionLosses ++;
                continue;
            } else {
                standingsData[teamA.rosterID].divisionTies ++;
                standingsData[teamB.rosterID].divisionTies ++;
            }
        }
	}
	return standingsData;
}
