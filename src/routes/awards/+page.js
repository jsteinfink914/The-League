import { getAwards, getLeagueTeamManagers } from '$lib/utils/helper';

export async function load() {
    const awardsData = await getAwards();
    const teamManagersData = await getLeagueTeamManagers();

    return {
        awardsData,
        teamManagersData,
    };
}