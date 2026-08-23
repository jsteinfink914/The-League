import { get } from 'svelte/store';
import {leagueData} from '$lib/stores';
import { leagueID } from '$lib/utils/leagueInfo';
import { fetchJson } from './request';

export const getLeagueData = async (queryLeagueID = leagueID) => {
	const storeValue = get(leagueData);
	if(storeValue && storeValue[queryLeagueID]) {
		return storeValue[queryLeagueID];
	}
const data = await fetchJson(`https://api.sleeper.app/v1/league/${queryLeagueID}`, {
  compress: true
});
	
	if (data) {
		leagueData.update(ld => {ld[queryLeagueID] = data; return ld});
		return data;
	} else {
		throw new Error(`Invalid league data received for ${queryLeagueID}`);
	}
}