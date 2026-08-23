
<script>
	import LinearProgress from '@smui/linear-progress';
	import MatchupWeeks from './MatchupWeeks.svelte';
	import Brackets from './Brackets.svelte';
    import Button, { Group, Label } from '@smui/button';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { loadPlayers } from '$lib/utils/helper';
    import { resolveMatchupLoadState } from './matchupLoadState';

	export let queryWeek, leagueTeamManagersData, matchupsData, bracketsData, playersData;

    let players, matchupWeeks = [], year, week, regularSeasonLength, brackets, leagueTeamManagers;
    let failedWeeks = [];
    let errorMessage = '';
    let bracketError = '';

    let loading = true;

    onMount(async () => {
        const [bracketsInfo, matchupsInfo, managerInfo, playersInfo] = await Promise.all([
            bracketsData,
            matchupsData,
            leagueTeamManagersData,
            playersData
        ]);
        const state = resolveMatchupLoadState({ bracketsInfo, matchupsInfo, managerInfo, playersInfo });
        errorMessage = state.errorMessage;
        if (!errorMessage) {
            brackets = state.brackets;
            bracketError = state.bracketError;
            matchupWeeks = state.matchupWeeks;
            year = state.year;
            week = state.week;
            regularSeasonLength = state.regularSeasonLength;
            failedWeeks = state.failedWeeks;
            players = state.players;
            leagueTeamManagers = state.leagueTeamManagers;
        }
        loading = false;

        if(!errorMessage && state.playersStale) {
            const newPlayersInfo = await loadPlayers(null, true);
            players = newPlayersInfo.players;
        }
    });

    const changeSelection = (s) => {
        if(s == 'regular') {
            queryWeek = 1;
            goto(`/matchups?week=1`, {noscroll: true});
        } else if(selection == 'regular') {
            queryWeek = 99;
            goto(`/matchups?week=99`, {noscroll: true});
        }
        selection = s;
    }

    let selection = 'regular';
</script>

<style>
    .message {
        display: block;
        width: 85%;
        max-width: 500px;
        margin: 80px auto;
    }

    .buttonHolder {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin: 3em 0;
    }

    .partial {
        width: 85%;
        max-width: 700px;
        margin: 1rem auto;
        padding: .75rem 1rem;
        border: 1px solid #c58b00;
        border-radius: 4px;
        color: #6b4a00;
        background: #fff7df;
    }

    .retry-button {
        display: block;
        margin: 1rem auto 0;
    }
</style>



{#if loading}
    <!-- promise is pending -->
    <div class="message">
        <p>Loading league matchups...</p>
        <LinearProgress indeterminate />
    </div>
{:else}
    {#if errorMessage}
        <div class="message" role="alert">
            <p>{errorMessage}</p>
            <button class="retry-button" type="button" on:click={() => window.location.reload()}>Retry</button>
        </div>
    {:else}
    {#if failedWeeks.length}
        <p class="partial" role="status">
            Some matchup weeks could not be loaded ({failedWeeks.join(', ')}). Showing the available data; refresh to retry.
        </p>
    {/if}
    {#if matchupWeeks.some((matchup) => !matchup.unavailable)}
        <div class="buttonHolder">
            <Group variant="outlined">
                <!-- Regular Season -->
                <Button class="selectionButtons" on:click={() => changeSelection('regular')} variant="{selection == 'regular' ? "raised" : "outlined"}">
                    <Label>Regular Season</Label>
                </Button>
                <!-- Championship Bracket -->
                <Button class="selectionButtons" on:click={() => changeSelection('champions')} variant="{selection == 'champions' || selection == 'losers' ? "raised" : "outlined"}">
                    <Label>Playoffs</Label>
                </Button>
            </Group>
            {#if selection == 'champions' || selection == 'losers'}
                <Group variant="outlined">
                    <!-- Championship Bracket -->
                    <Button class="selectionButtons" on:click={() => changeSelection('champions')} variant="{selection == 'champions' ? "raised" : "outlined"}">
                        <Label>Champions' Bracket</Label>
                    </Button>
                    <!-- Losers Bracket -->
                    <Button class="selectionButtons" on:click={() => changeSelection('losers')} variant="{selection == 'losers' ? "raised" : "outlined"}">
                        <Label>Losers' Bracket</Label>
                    </Button>
                </Group>
            {/if}
        </div>
        {#if selection == 'regular'}
            <MatchupWeeks {players} {queryWeek} {matchupWeeks} {failedWeeks} {regularSeasonLength} {year} {week} bind:selection={selection} {leagueTeamManagers} />
        {/if}
    {:else}
        <div class="message">
            <p>No upcoming matchups...</p>
        </div>
    {/if}
    <!-- {promise has processed -->
    {#if bracketError}
        <p class="partial" role="status">Playoff brackets are temporarily unavailable. Regular-season matchups are still shown; refresh to retry.</p>
    {/if}
    {#if brackets?.champs?.bracket?.[0]?.[0]?.[0]?.points && (selection == 'champions' || selection == 'losers')}
        <Brackets {queryWeek} {leagueTeamManagers} {players} {brackets} bind:selection={selection} />
    {/if}
    {/if}
{/if}