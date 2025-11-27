import { getLeagueTeamManagers, loadPlayers, getLeagueTransactions, getLeagueRecords } from '$lib/utils/helper';

export async function load({url, fetch}) {

    const playerOne = url?.searchParams?.get('player_one');
    const playerTwo = url?.searchParams?.get('player_two');

    return {
        leagueTeamManagerData: await getLeagueTeamManagers(),
        playersData: await loadPlayers(fetch),
        transactionsData: await getLeagueTransactions(),
        recordsData: await getLeagueRecords(),
        playerOne,
        playerTwo,
    };
}