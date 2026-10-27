import { getLeagueMatchups, getLeagueTeamManagers, getLeagueRosters, getLeagueData } from '$lib/utils/helper';

export async function load() {
    const matchupsData = await getLeagueMatchups();
    const leagueTeamManagersData = await getLeagueTeamManagers();
    const rostersData = await getLeagueRosters();
    const leagueData = await getLeagueData();

    return {
        matchupsData,
        leagueTeamManagersData,
        rostersData,
        leagueData,
    };
}
