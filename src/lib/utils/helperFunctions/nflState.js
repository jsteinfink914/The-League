import { get } from 'svelte/store';
import {nflState} from '$lib/stores';

export const getNflState = async () => {
	const storeValue = get(nflState);
	if(storeValue && storeValue.season) {
		return storeValue;
	}
    const res = await fetch(`https://api.sleeper.app/v1/state/nfl`, {compress: true});
	
	if (!res.ok) {
		const errorText = await res.text().catch(() => 'Unknown error');
		throw new Error(`Failed to fetch NFL state: ${res.status} ${errorText}`);
	}
	
	const data = await res.json();
	
	if (data && data.season) {
		nflState.update(() => data);
		return data;
	} else {
		throw new Error('Invalid NFL state data received');
	}
}