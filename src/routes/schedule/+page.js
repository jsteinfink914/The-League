import { getLeagueMatchups, getLeagueTeamManagers, getLeagueRosters } from '$lib/utils/helper';

export async function load() {
    const matchupsData = await getLeagueMatchups();
    const leagueTeamManagersData = await getLeagueTeamManagers();
    const rostersData = await getLeagueRosters();

    return {
        matchupsData,
        leagueTeamManagersData,
        rostersData,
    };
}
