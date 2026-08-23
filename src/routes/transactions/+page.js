import { getLeagueTransactions, loadPlayers, getLeagueTeamManagers } from '$lib/utils/helper';

const asResult = (promise, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out.`)), 12_000))
]).catch((error) => ({ error: error.message || `${label} could not be loaded.` }));

export async function load({ url, fetch }) {
    const show = url?.searchParams?.get('show');
    const query = url?.searchParams?.get('query');
    const curPage = url?.searchParams?.get('page');

    const transactionsData = asResult(getLeagueTransactions(false), 'Transaction data');
    const leagueTeamManagersData = asResult(getLeagueTeamManagers(), 'League manager data');
    const playersData = asResult(loadPlayers(fetch), 'Player data');

    const bannedValued = [
        'undefined',
    ]

    const props = {
        show: "both",
        query: "",
        playersData,
        transactionsData,
        leagueTeamManagersData,
        page: 0,
    }
    if(show && (show == "trade" || show == "waiver" || show == "both")) {
        props.show = show;
    }
    if(query && !bannedValued.includes(query)) {
        props.query = query;
    }
    if(curPage && !isNaN(curPage)) {
        props.page = parseInt(curPage) - 1;
    }
    return props;
}