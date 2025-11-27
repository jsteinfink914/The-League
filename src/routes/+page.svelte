<script>
	import LinearProgress from '@smui/linear-progress';
	import { leagueName, homepageText, managers, gotoManager, enableBlog } from '$lib/utils/helper';
	import { Transactions, PowerRankings, HomePost} from '$lib/components';
	import { getAvatarFromTeamManagers, getTeamFromTeamManagers } from '$lib/utils/helperFunctions/universalFunctions';
    import Papa from 'papaparse';
    import { onMount } from 'svelte';

    export let data;

</script>

<style>
    #home {
        display: flex;
        flex-wrap: nowrap;
        position: relative;
        overflow-y: hidden;
        z-index: 1;
    }

    #main {
        flex-grow: 1;
        min-width: 320px;
        margin: 0 auto;
        padding: 60px 0;
    }

    .text {
        padding: 0 30px;
        max-width: 620px;
        margin: 0 auto;
    }

    .leagueData {
        position: relative;
        z-index: 1;
        width: 100%;
        min-width: 470px;
        max-width: 470px;
        min-height: 100%;
		background-color: var(--ebebeb);
        border-left: var(--eee);
		box-shadow: inset 8px 0px 6px -6px rgb(0 0 0 / 24%);
    }
    
    @media (max-width: 950px) {
        .leagueData {
            max-width: 100%;
            min-width: 100%;
            width: 100%;
		    box-shadow: none;
        }
        #home {
            flex-wrap: wrap;
        }
        th, td {
            font-size: 12px;
            padding: 5px;
            }
    }


    .transactions {
        display: block;
        width: 95%;
        margin: 10px auto;
    }

    .center {
        text-align: center;
    }

    h6 {
        text-align: center;
    }

    .homeBanner {
        background-color: var(--blueOne);
        color: #fff;
        padding: 0.5em 0;
        font-weight: 500;
        font-size: 1.5em;
    }

    /* champ styling */
    #currentChamp {
        padding: 25px 0;
		background-color: var(--f3f3f3);
        box-shadow: 5px 0 8px var(--champShadow);
        border-left: 1px solid var(--ddd);
    }

    #champ {
        position: relative;
        width: 150px;
        height: 150px;
        margin: 0 auto;
        cursor: pointer;
    }

    .first {
        position: absolute;
        transform: translate(-50%, -50%);
        width: 80px;
        height: 80px;
        border-radius: 100%;
        border: 1px solid #ccc;
        left: 50%;
        top: 43%;
    }

    .laurel {
        position: absolute;
        transform: translate(-50%, -50%);
        width: 135px;
        height: auto;
        left: 50%;
        top: 50%;
    }

    h4 {
        text-align: center;
        font-size: 1.8em;
        margin: 10px;
        font-style: italic;
    }

    .label {
        display: table;
        text-align: center;
        line-height: 1.1em;
        font-size: 1.7em;
        margin: 6px auto 10px;
        cursor: pointer;
    }
    
	:global(.curOwner) {
		font-size: 0.75em;
		color: #bbb;
		font-style: italic;
	}
    .image-container {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%; /* Ensures the container takes full width */
  }
  .image-container img {
    width: 60%;
    height: 50%;
  }
</style>

<div id="home">
    <div id="main">
        <div class="text">
            <h6>{leagueName}</h6>
            <!-- homepageText contains the intro text for your league, this gets edited in /src/lib/utils/leagueInfo.js -->
            {@html homepageText }
            <!-- Most recent Blog Post (if enabled) -->
            {#if enableBlog}
                <HomePost />
            {/if}
        </div>
    </div>
    
    <div class="leagueData">
        <div class="homeBanner">
            {#if data.nflState}
                <div class="center">NFL {data.nflState.season} 
                    {#if data.nflState.season_type == 'pre'}
                        Preseason
                    {:else if data.nflState.season_type == 'post'}
                        Postseason
                    {:else}
                        Season - {data.nflState.week > 0 ? `Week ${data.nflState.week}` : "Preseason"}
                    {/if}
                </div>
            {:else}
                <div class="center">Retrieving NFL state...</div>
                <LinearProgress indeterminate />
            {/if}
        </div>

        <div id="currentChamp">
            {#if data.podiumsData && data.leagueTeamManagersData}
                {#if data.podiumsData[0]}
                    <h4>{data.podiumsData[0].year} Fantasy Champ</h4>
                    <div id="champ" on:click={() => {if(managers.length) gotoManager({year: data.podiumsData[0].year, leagueTeamManagers: data.leagueTeamManagersData, rosterID: parseInt(data.podiumsData[0].champion)})}} >
                        <img src="{getAvatarFromTeamManagers(data.leagueTeamManagersData, data.podiumsData[0].champion, data.podiumsData[0].year)}" class="first" alt="champion" />
                        <img src="/laurel.png" class="laurel" alt="laurel" />
                    </div>
                    <span class="label" on:click={() => gotoManager({year: data.podiumsData[0].year, leagueTeamManagers: data.leagueTeamManagersData, rosterID: parseInt(data.podiumsData[0].champion)})} >{getTeamFromTeamManagers(data.leagueTeamManagersData, data.podiumsData[0].champion, data.podiumsData[0].year).name}</span>
                {:else}
                    <p class="center">No former champs.</p>
                {/if}
            {:else}
                <p class="center">Retrieving awards...</p>
                <LinearProgress indeterminate />
            {/if}
        </div>

        <div class="transactions" >
            <Transactions />
        </div>
    </div>
</div>
