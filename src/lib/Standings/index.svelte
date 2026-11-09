<script>
    import { leagueName } from '$lib/utils/helper';
    import { getTeamFromTeamManagers } from '$lib/utils/helperFunctions/universalFunctions';
    import DataTable, { Head, Body, Row, Cell } from '@smui/data-table';
    import LinearProgress from '@smui/linear-progress';
    import { onMount } from 'svelte';
    import Standing from './Standing.svelte';

    export let standingsData, leagueTeamManagersData;

    // Least important to most important (i.e. the most important [usually wins] goes last)
    const sortOrder = ["fptsAgainst", "divisionTies", "divisionWins", "fpts", "ties", "wins"];

    // Display formatting lives here, at render time — the standings data
    // itself stays numeric so sorting and comparisons never see text.
    const fmt2 = (v) => (Math.round((v + Number.EPSILON) * 100) / 100).toFixed(2);

    // Column order from left to right
    const columnOrder = [
        { name: "W", field: "wins" },
        { name: "T", field: "ties" },
        { name: "L", field: "losses" },
        { name: "Div W", field: "divisionWins" },
        { name: "Div T", field: "divisionTies" },
        { name: "Div L", field: "divisionLosses" },
        { name: "FPTS", field: "fpts", format: (row) => fmt2(row.fpts) },
        { name: "FPTS Against", field: "fptsAgainst", format: (row) => fmt2(row.fptsAgainst) },
        { name: "SOS (Pts)", field: "sos", format: (row) => `${fmt2(row.sos)} (${row.sosRank})` },
        { name: "SOS (Rec)", field: "sosRecord", format: (row) => `${row.sosRecord.toFixed(3)} (${row.sosRecordRank})` },
        { name: "SOS (Luck)", field: "sosLuck", format: (row) => `${row.sosLuck > 0 ? '+' : ''}${row.sosLuck.toFixed(1)} (${row.sosLuckRank})` },
        { name: "Luck", field: "luck", format: (row) => `${row.luck > 0 ? '+' : ''}${row.luck.toFixed(1)}` },
        { name: "Streak", field: "streak" }
    ];

    let loading = true;
    let preseason = false;
    let standings, year, leagueTeamManagers;
    let sortColumn = '';  // Track the column being sorted
    let sortDirection = 'asc'; // Track sort direction
    let innerWidth;

    onMount(async () => {
        const asyncStandingsData = await standingsData;
        if (!asyncStandingsData) {
            loading = false;
            preseason = true;
            return;
        }
        const { standingsInfo, yearData } = asyncStandingsData;
        leagueTeamManagers = await leagueTeamManagersData;
        year = yearData;

        let finalStandings = Object.keys(standingsInfo).map((key) => standingsInfo[key]);

        for (const sortType of sortOrder) {
            if (!finalStandings[0][sortType] && finalStandings[0][sortType] != 0) {
                continue;
            }
            finalStandings = [...finalStandings].sort((a, b) => b[sortType] - a[sortType]);
        }

        standings = finalStandings;
        loading = false;
    });

    // Function to handle sorting
    const handleSort = (columnField) => {
        if (columnField === sortColumn) {
            // If clicking the same column, toggle the direction
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // Otherwise, set a new column to sort
            sortColumn = columnField;
            sortDirection = 'asc'; // Default to ascending on new column
        }

        // Apply sorting based on the column and direction. Values are
        // numbers in the data (formatting happens at render), so numeric
        // columns compare numerically; text (streaks) compares as text.
        standings = [...standings].sort((a, b) => {
            const valA = a[columnField];
            const valB = b[columnField];
            const cmp = (typeof valA === 'number' && typeof valB === 'number')
                ? valA - valB
                : String(valA).localeCompare(String(valB));

            return sortDirection === 'asc' ? cmp : -cmp;
        });
    };
</script>

<svelte:window bind:innerWidth={innerWidth} />

<style>
    .loading {
        display: block;
        width: 85%;
        max-width: 500px;
        margin: 80px auto;
    }

    :global(.center) {
        text-align: center;
    }

    :global(.wrappable) {
        white-space: normal;
        line-height: 1.2em;
    }

    h1 {
        font-size: 2.2em;
        line-height: 1.3em;
        margin: 1.5em 0 2em;
    }

    .standingsTable {
        max-width: 100%;
        overflow-x: scroll;
        margin: 0.5em 0 5em;
    }

    .sosNote {
        font-size: 0.85em;
        font-style: italic;
        margin-top: 0.75em;
        text-align: left;
    }

    .sortable {
        cursor: pointer;
        user-select: none;
    }

    .sortable::after {
        content: " ↑↓";
        font-size: 0.8em;
    }

    .sortable.asc::after {
        content: " ↑";
    }

    .sortable.desc::after {
        content: " ↓";
    }
</style>

<h1>{year ?? ''} {leagueName} Standings</h1>

{#if loading}
    <div class="loading">
        <p>Loading Standings...</p>
        <LinearProgress indeterminate />
    </div>
{:else if preseason}
    <div class="loading">
        <p>Preseason, No Standings Yet</p>
    </div>
{:else}
    <div class="standingsTable">
        <DataTable table$aria-label="League Standings">
            <Head>
                <Row>
                    <Cell class="center">Team</Cell>
                    {#each columnOrder as column}
                        <Cell
                            class="center wrappable sortable {column.field === sortColumn ? sortDirection : ''}"
                            on:click={() => handleSort(column.field)}
                        >
                            {column.name}
                        </Cell>
                    {/each}
                </Row>
            </Head>
            <Body>
                {#each standings as standing}
                    <Standing {columnOrder} {standing} {leagueTeamManagers} team={getTeamFromTeamManagers(leagueTeamManagers, standing.rosterID)} />
                {/each}
            </Body>
        </DataTable>
        <p class="sosNote">SOS (Pts) = average weekly points scored by the opponents each team has faced this season. SOS (Rec) = those opponents' combined win percentage. Higher means a tougher schedule either way; the number in parentheses is the league rank (1 = toughest). Luck = wins minus all-play expected wins — positive means the schedule has handed them wins, negative means their scoring deserved better. SOS (Luck) = how far opponents' scoring against each team ran from those opponents' own season averages, in points per game — positive means opponents underperformed against them (rank 1 = luckiest).</p>
    </div>
{/if}
