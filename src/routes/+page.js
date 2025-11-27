import { getNflState, getAwards, getLeagueTeamManagers } from '$lib/utils/helper';

export async function load() {
    const nflState = await getNflState();
    const podiumsData = await getAwards();
    const leagueTeamManagersData = await getLeagueTeamManagers();

    return {
        nflState,
        podiumsData,
        leagueTeamManagersData
    };
}

