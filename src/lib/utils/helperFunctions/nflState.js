import { get } from 'svelte/store';
import {nflState} from '$lib/stores';
import { fetchJson } from './request';

export const getNflState = async () => {
	const storeValue = get(nflState);
	if(storeValue && storeValue.season) {
		return storeValue;
	}
const data = await fetchJson(`https://api.sleeper.app/v1/state/nfl`, {compress: true});
	
	if (data && data.season) {
		nflState.update(() => data);
		return data;
	} else {
		throw new Error('Invalid NFL state data received');
	}
}