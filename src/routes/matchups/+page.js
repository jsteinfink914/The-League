import { getBrackets, getLeagueMatchups, getLeagueTeamManagers, loadPlayers } from '$lib/utils/helper';

export async function load({ url, fetch }) {
    const queryWeek = url?.searchParams?.get('week');
    return {
        queryWeek: isNaN(queryWeek) ? null : queryWeek,
        matchupsData: await getLeagueMatchups(),
        bracketsData: await getBrackets(),
        leagueTeamManagersData: await getLeagueTeamManagers(),
        playersData: await loadPlayers(fetch),
    };
}