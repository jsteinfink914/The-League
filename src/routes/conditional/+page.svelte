<script>
    let trades = [
        {
            date: "11/1/23",
            parties: "Abul and Coyne",
            picks: ["Coyne’s 25 1", "Sween’s 25 1", "Dev’s 25 1"],
            conditions: "The three picks (Coyne’s 25 1, Sween’s 25 1, and Dev’s 25 1) are to be pooled and selected by the pick holders in the following order: Holder of Coyne’s 25 1, Holder of Sween’s 25 1, Holder of Dev’s 25 1. The selection will take place once all implicated picks have been determined."
        },
        {
            date: "11/21/24",
            parties: "Will and Coyne",
            picks: ["Will's 2028 3"],
            conditions: "Will owes Coyne his 2028 3 upon the pick becoming available to trade. Deal involving Ekeler and Ertz for Rhamondre."
        },
        {
            date: "11/22/24",
            parties: "Chi and Ska",
            picks: ["Chi's 2025 1", "Will's 2025 1"],
            conditions: "Chi's pick is top-4 protected. If the pick is within the top 4, Ska will receive Will's 2025 1 instead. Deal for Aaron Jones."
        },
        {
            date: "11/25/24",
            parties: "Tombs and Coyne",
            picks: ["Mc's 2028 slate of picks"],
            conditions: "Mc owes Coyne his 2028 slate of picks upon them becoming available. Deal for Kittle and Ekeler."
        },
    {
            date: "5/10/25",
            parties: "Steiny and Coyne",
            picks: ["Steiny's 28 1 and 28,29,30, and 31 3rd round picks."],
            conditions: "Steiny owes Coyne his 3rd round pick until 2031 upon them becoming available. Deal for Goedert."
        },
{
date: "6/18/25",
            parties: "Z and Coyne",
            picks: ["Z's '28 2nd round pick."],
            conditions: "Z owes Coyne his '28 2. Deal for Olave."
},
{
            date: "7/1/25",
            parties: "Sween and Coyne",
            picks: ["Sween, Will, Abul, Coyne 2027 1st round picks."],
            conditions: "Holder of Sween's 27 1 is entitled to the third best pick of Sween, Will, Abul, and Coyne's 27 1's after all have been finalized. Trade for Waddle."
        },
{
            date: "7/3/25",
            parties: "Ska and Coyne",
            picks: ["Coop, Will, Jeff, Abul, Mcsherry 2026 3rd round picks."],
            conditions: "Holder of Coop's 26 3 is entitled to the best pick of Coop, Will, Jeff, Abul, Mcsherry 2026 3rds after all have been finalized. Trade for Chi Watson."
}

        // Add more trade objects as needed

    ];

    let selectedTrade = null;

    const toggleTrade = (index) => {
        selectedTrade = selectedTrade === index ? null : index;
    };
</script>

<style>
    .trade-info {
        border: 1px solid #ddd;
        padding: 15px;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        line-height: 1.6;
        max-width: 600px;
        margin: 0 auto;
    }

    h2 {
        font-size: 1.5em;
        text-align: center;
    }

    .dropdown {
        margin-bottom: 10px;
        cursor: pointer;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 5px;
        text-align: center;
    }

    .dropdown h3 {
        margin: 0;
        font-size: 1.2em;
    }

    .section {
        margin-bottom: 10px;
        text-align: center;
    }

    .section h3 {
        margin: 0 0 5px;
        font-size: 1.2em;
    }

    .section p, .section ul {
        margin: 0;
        font-size: 1em;
    }

    ul {
        padding-left: 20px;
        text-align: left;
    }

    @media (max-width: 600px) {
        .trade-info {
            padding: 10px;
            font-size: 0.9em;
        }

        h2 {
            font-size: 1.2em;
        }

        .dropdown h3 {
            font-size: 1em;
        }

        .section h3 {
            font-size: 1em;
        }

        .section p, .section ul {
            font-size: 0.9em;
        }
    }
</style>

<div class="trade-info">
    <h2>Trade Details</h2>
    
    {#each trades as trade, index}
        <div class="dropdown" on:click={() => toggleTrade(index)}>
            <h3>{trade.parties} - {trade.date}</h3>
        </div>
        {#if selectedTrade === index}
            <div class="section">
                <h3>Date of Trade:</h3>
                <p>{trade.date}</p>
            </div>
            <div class="section">
                <h3>Parties Involved:</h3>
                <p>{trade.parties}</p>
            </div>
            <div class="section">
                <h3>Picks Involved:</h3>
                <p>
                    {#each trade.picks as pick}
                        {pick}<br>
                    {/each}
                </p>
            </div>
            <div class="section">
                <h3>Conditions:</h3>
                <p>{trade.conditions}</p>
            </div>
        {/if}
    {/each}
</div>
