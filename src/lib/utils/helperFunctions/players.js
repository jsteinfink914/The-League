import {players} from '$lib/stores';
import { browser } from '$app/environment';
import { fetchJson } from './request';
import { getPlayerCacheExpiration, hasFreshPlayerCache } from './playerCache';

export const loadPlayers = async (servFetch, refresh = false) => {     
    const smartFetch = servFetch ?? fetch;
    
    const now = Date.now();
    let playersInfo = null;
    let expiration = null;
    if(browser) {
        try {
            const cached = JSON.parse(localStorage.getItem('playersInfo') || 'null');
            const cachedExpiration = Number(localStorage.getItem('playersInfoExpiration'));
            if (cached && cached[1426] && Number.isFinite(cachedExpiration)) {
                playersInfo = cached;
                expiration = cachedExpiration;
            }
        } catch {
            localStorage.removeItem('playersInfo');
            localStorage.removeItem('playersInfoExpiration');
        }
    }

    if(hasFreshPlayerCache(playersInfo, expiration, now, refresh)) {
        return {
            players: playersInfo,
            stale: false
        }
    }
    
    if(!hasFreshPlayerCache(playersInfo, expiration, now, refresh)) {
        let data;
        try {
            data = await fetchJson(`/api/fetch_players_info`, {compress: true}, { fetcher: smartFetch });
            if (!data || typeof data !== 'object' || !data[1426]) {
                throw new Error('Player service returned an invalid player list.');
            }
        } catch (error) {
            if (playersInfo?.[1426]) {
                players.update(() => playersInfo);
                return { players: playersInfo, stale: true };
            }
            throw error;
        }

        if(browser) {
            localStorage.setItem("playersInfo", JSON.stringify(data))

            const newExpiration = getPlayerCacheExpiration(now);

            localStorage.setItem("playersInfoExpiration", newExpiration)

            players.update(() => data);
        }

        return {
            players: data,
            stale: false
        };
    }
    players.update(() => playersInfo);
    return {
        players: playersInfo,
        stale: false
    };
}