import { getLeagueData } from "./leagueData"
import { leagueID } from '$lib/utils/leagueInfo';
import { getNflState } from "./nflState"
import { fetchJson, allSettledWithConcurrency } from './request';
import { get } from 'svelte/store';
import {matchupsStore} from '$lib/stores';
import { buildMatchupWeeks } from './matchupResults';

export const getLeagueMatchups = async () => {
	if(get(matchupsStore).matchupWeeks) {
		return get(matchupsStore);
	}

const [nflState, leagueData] = await Promise.all([getNflState(), getLeagueData()]);

	let week = 1;
	if(nflState.season_type == 'regular') {
		week = nflState.display_week;
	} else if(nflState.season_type == 'post') {
		week = 18;
	}
	const year = leagueData.season;
	const regularSeasonLength = leagueData.settings.playoff_week_start - 1;

	// pull in all matchup data for the season
const matchupRequests = [];
	for(let i = 1; i < leagueData.settings.playoff_week_start; i++) {
    matchupRequests.push({
      week: i,
      load: () => fetchJson(`https://api.sleeper.app/v1/league/${leagueID}/matchups/${i}`, { compress: true })
    });
	}
const results = await allSettledWithConcurrency(matchupRequests.map((request) => request.load));
const successfulMatchups = results.filter((result) => result.status === 'fulfilled');

if (!successfulMatchups.length) {
  throw new Error(`Unable to load matchup data for ${year}. Try again later.`);
}
  const { matchupWeeks, failedWeeks } = buildMatchupWeeks(matchupRequests, results);

	const matchupsResponse = {
		matchupWeeks,
		year,
		week,
regularSeasonLength,
partial: failedWeeks.length > 0,
failedWeeks,
	}
	
	matchupsStore.update(() => matchupsResponse);

	return matchupsResponse;
}
