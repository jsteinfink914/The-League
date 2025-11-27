import { getNflState, getAwards, getLeagueTeamManagers } from '$lib/utils/helper';

export async function load() {
    let nflState, podiumsData, leagueTeamManagersData;
    
    try {
        console.log('Loading NFL state...');
        nflState = await getNflState();
        console.log('NFL state loaded successfully');
    } catch (err) {
        console.error('Failed to load NFL state:', err);
        throw err;
    }
    
    try {
        console.log('Loading awards...');
        podiumsData = await getAwards();
        console.log('Awards loaded successfully');
    } catch (err) {
        console.error('Failed to load awards:', err);
        throw err;
    }
    
    try {
        console.log('Loading league team managers...');
        leagueTeamManagersData = await getLeagueTeamManagers();
        console.log('League team managers loaded successfully');
    } catch (err) {
        console.error('Failed to load league team managers:', err);
        throw err;
    }

    return {
        nflState,
        podiumsData,
        leagueTeamManagersData
    };
}

