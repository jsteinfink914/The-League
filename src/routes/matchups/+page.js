import { getBrackets, getLeagueMatchups, getLeagueTeamManagers, loadPlayers } from '$lib/utils/helper';

const asResult = (promise, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out.`)), 12_000))
]).catch((error) => ({
    error: error.message || `${label} could not be loaded.`
}));

export async function load({ url, fetch }) {
    const queryWeek = url?.searchParams?.get('week');
    return {
        queryWeek: isNaN(queryWeek) ? null : queryWeek,
        matchupsData: asResult(getLeagueMatchups(), 'Matchup data'),
        bracketsData: asResult(getBrackets(), 'Playoff bracket data'),
        leagueTeamManagersData: asResult(getLeagueTeamManagers(), 'League manager data'),
        playersData: asResult(loadPlayers(fetch), 'Player data'),
    };
}