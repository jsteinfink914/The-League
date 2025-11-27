import { getNflState, getAwards, getLeagueTeamManagers } from '$lib/utils/helper';

export async function load() {
    try {
        // Load all data in parallel for better performance
        const [nflState, podiumsData, leagueTeamManagersData] = await Promise.all([
            getNflState(),
            getAwards(),
            getLeagueTeamManagers()
        ]);

        return {
            nflState,
            podiumsData,
            leagueTeamManagersData
        };
    } catch (err) {
        // Log the full error for debugging
        console.error('Home page load error:', {
            message: err.message,
            stack: err.stack,
            name: err.name
        });
        
        // Re-throw with more context
        throw new Error(`Failed to load home page: ${err.message}`);
    }
}

