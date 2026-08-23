<script>
	import LinearProgress from '@smui/linear-progress';
	import { TransactionsPage } from '$lib/components'
    import { waitForAll } from '$lib/utils/helper';
    import { getTransactionLoadError } from '$lib/Transactions/transactionLoadState';

    export let data;
    const {show, query, page, playersData, transactionsData, leagueTeamManagersData} = data;

	const perPage = 10;
</script>

<style>
    #main {
        position: relative;
        z-index: 1;
        display: block;
        margin: 30px auto;
		width: 95%;
		max-width: 1000px;
        overflow-y: hidden;
    }

	.loading {
		display: block;
		position: relative;
		z-index: 1;
		width: 85%;
		max-width: 500px;
		margin: 80px auto;
	}
</style>

<div id="main">
    {#await waitForAll(transactionsData, playersData, leagueTeamManagersData)}
        <div class="loading" >
            <p>Loading league transactions...</p>
            <LinearProgress indeterminate />
        </div>
    {:then [transactionsInfo, playersInfo, leagueTeamManagers]}
        {#if getTransactionLoadError([transactionsInfo, playersInfo, leagueTeamManagers])}
            <div class="loading" role="alert">
                <p>{getTransactionLoadError([transactionsInfo, playersInfo, leagueTeamManagers])}</p>
                <button type="button" on:click={() => window.location.reload()}>Retry</button>
            </div>
        {:else}
            {@const {transactions, currentTeams, stale, partial, failedWeeks} = transactionsInfo}
        <TransactionsPage {playersInfo} {stale} {partial} {failedWeeks} {transactions} {currentTeams} {show} {query} queryPage={page} {perPage} postUpdate={true} {leagueTeamManagers} />
        {/if}
    {:catch error}
        <p class="center">Something went wrong: {error.message}</p>
    {/await}
</div>