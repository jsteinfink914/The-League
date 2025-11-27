import { get } from 'svelte/store';
import {leagueData} from '$lib/stores';
import { leagueID } from '$lib/utils/leagueInfo';

export const getLeagueData = async (queryLeagueID = leagueID) => {
	const storeValue = get(leagueData);
	if(storeValue && storeValue[queryLeagueID]) {
		return storeValue[queryLeagueID];
	}
    const res = await fetch(`https://api.sleeper.app/v1/league/${queryLeagueID}`, {compress: true});
	
	if (!res.ok) {
		const errorText = await res.text().catch(() => 'Unknown error');
		throw new Error(`Failed to fetch league data for ${queryLeagueID}: ${res.status} ${errorText}`);
	}
	
	const data = await res.json();
	
	if (data) {
		leagueData.update(ld => {ld[queryLeagueID] = data; return ld});
		return data;
	} else {
		throw new Error(`Invalid league data received for ${queryLeagueID}`);
	}
}