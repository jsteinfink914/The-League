<script>
	import { goto } from '$app/navigation';
	import { getLeagueTransactions, getLeagueTeamManagers, loadPlayers, waitForAll } from '$lib/utils/helper';
	import LinearProgress from '@smui/linear-progress';
	import { onMount } from 'svelte';
	import TradeTransaction from './TradeTransaction.svelte';
	import WaiverTransaction from './WaiverTransaction.svelte';

	let loading = true;
	let players;
	let transactions;
    let leagueTeamManagers;
let partial = false;
let failedWeeks = [];
let loadError = '';

	onMount(async () => {
try {
		const [transactionsData, playersData, leagueTeamManagersData] = await waitForAll(getLeagueTransactions(true),loadPlayers(null), getLeagueTeamManagers());
		players = playersData.players;
		transactions = transactionsData.transactions;
partial = Boolean(transactionsData.partial);
failedWeeks = transactionsData.failedWeeks || [];
        leagueTeamManagers = leagueTeamManagersData;
		loading = false;

		if(transactionsData.stale) {
			const newTransactions = await getLeagueTransactions(true, true);
			transactions = newTransactions.transactions;
		}

		if(playersData.stale) {
			const newPlayersData = await loadPlayers(true);
			players = newPlayersData.players;
		}
} catch (error) {
loadError = error.message || 'League transactions could not be loaded.';
} finally {
loading = false;
}
	})
</script>

<style>
	.transactions {
		position: relative;
		width: 100%;
		z-index: 1;
	}

	p {
		text-align: center;
	}

	h5 {
		text-align: center;
		margin: 10px auto 16px;
	}

	.link {
		cursor: pointer;
		color: #888;
		padding: 10px 20px;
		margin-bottom: 10px;
	}

	.link:hover {
		color: #00316b;
	}

	.nothingYet {
		margin: 5em 0;
	}

.partial {
margin: 1rem auto;
padding: .75rem;
border: 1px solid #c58b00;
background: #fff7df;
color: #6b4a00;
}
</style>

<div class="transactions">
	{#if loading}
		<p>Loading league transactions...</p>
		<LinearProgress indeterminate />
	{:else}
{#if loadError}
<p class="partial" role="alert">{loadError} <button type="button" on:click={() => window.location.reload()}>Retry</button></p>
{:else}
{#if partial}
<p class="partial" role="status">Some transaction weeks could not be loaded ({failedWeeks.join(', ')}). Showing available transactions; refresh to retry.</p>
{/if}
		<!-- waiver -->
		{#if transactions.waivers.length}
			<h5>Recent Waiver Moves</h5>
			{#each transactions.waivers as transaction }
				<WaiverTransaction {players} {transaction} {leagueTeamManagers} />
			{/each}

			<p on:click={() => goto("/transactions?show=waiver&query=&page=1")} class="link">( view more )</p>
		{:else}
			<p class="nothingYet">No waiver moves have been made yet...</p>
		{/if}

		{#if transactions.waivers.length && transactions.trades.length}
			<br />
		{/if}

		<!-- trades -->
		{#if transactions.trades.length}
			<h5>Recent Trades</h5>
			{#each transactions.trades as transaction }
				<TradeTransaction {players} {transaction} {leagueTeamManagers} />
			{/each}

			<p on:click={() => goto("/transactions?show=trade&query=&page=1")} class="link">( view more )</p>
		{:else}
			<p class="nothingYet">No trades have been made yet...</p>
		{/if}
	{/if}
{/if}
</div>