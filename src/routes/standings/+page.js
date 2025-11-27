import { getLeagueStandings, getLeagueTeamManagers } from '$lib/utils/helper';

export async function load() {

    const standingsData = await getLeagueStandings();
    const leagueTeamManagersData = await getLeagueTeamManagers();

    return {
        standingsData,
        leagueTeamManagersData,
    };
}