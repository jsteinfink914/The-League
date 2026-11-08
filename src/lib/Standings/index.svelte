<script>
    import { leagueName, round } from '$lib/utils/helper';
    import { getTeamFromTeamManagers } from '$lib/utils/helperFunctions/universalFunctions';
    import DataTable, { Head, Body, Row, Cell } from '@smui/data-table';
    import LinearProgress from '@smui/linear-progress';
    import { onMount } from 'svelte';
    import Standing from './Standing.svelte';

    export let standingsData, leagueTeamManagersData;

    // Least important to most important (i.e. the most important [usually wins] goes last)
    const sortOrder = ["fptsAgainst", "divisionTies", "divisionWins", "fpts", "ties", "wins"];

    // Column order from left to right
    const columnOrder = [
        { name: "W", field: "wins" },
        { name: "T", field: "ties" },
        { name: "L", field: "losses" },
        { name: "Div W", field: "divisionWins" },
        { name: "Div T", field: "divisionTies" },
        { name: "Div L", field: "divisionLosses" },
        { name: "FPTS", field: "fpts" },
        { name: "FPTS Against", field: "fptsAgainst" },
        { name: "SOS (Pts)", field: "sos" },
        { name: "SOS (Rec)", field: "sosRecord" },
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

        // Apply sorting based on the column and direction.
        // Points totals and SOS values are strings (e.g. "1102.40",
        // "112.41 (6)"), so compare them by their numeric value — as raw
        // text, "987.65" would wrongly sort above "1102.40". Non-numeric
        // values (streaks, etc.) fall back to plain text comparison.
        standings = [...standings].sort((a, b) => {
            const valA = a[columnField];
            const valB = b[columnField];
            const numA = parseFloat(valA);
            const numB = parseFloat(valB);
            const cmp = (!isNaN(numA) && !isNaN(numB))
                ? (numA < numB ? -1 : numA > numB ? 1 : 0)
                : (valA < valB ? -1 : valA > valB ? 1 : 0);

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
        <p class="sosNote">SOS (Pts) = average weekly points scored by the opponents each team has faced this season. SOS (Rec) = those opponents' combined win percentage. Higher means a tougher schedule either way; the number in parentheses is the league rank (1 = toughest).</p>
    </div>
{/if}
