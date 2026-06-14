<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import { leagueID } from '$lib/utils/leagueInfo';
  import {
    buildRookieContracts,
    buildValueIndexes,
    getContractBreakdown,
    parseFantasyProsMarketCsv,
    resolvePlayerValue
  } from '$lib/utils/playerNameLookup';
  Chart.register(...registerables);

  const valueYear = '2026';

  let managers = [];
  let selectedManager = "";
  let managerRosters = {};
  let totalValues = [];
  let chart;

  const fetchData = async () => {
    try {
      // Fetch rosters
      const rosterResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueID}/rosters`);
      const rosters = await rosterResponse.json();

      // Fetch players
      const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
      const players = await playersResponse.json();

      // Fetch player mappings
      const playerMapResponse = await fetch('/fp_sleeper_mapping.txt');
      const playerMapText = await playerMapResponse.text();
      const playerMappings = Papa.parse(playerMapText, { header: true }).data;

      // Fetch manager mappings
      const managerMapResponse = await fetch('/Manager_map.txt');
      const managerMapText = await managerMapResponse.text();
      const managerMappings = Papa.parse(managerMapText, { header: true }).data;
      const managerMap = new Map(managerMappings.map(entry => [entry.Index, entry.Name]));

      // Organize rosters by team name
      let rostersByTeam = {};
      rosters.forEach(roster => {
        let index = roster.roster_id;
        rostersByTeam[index] = roster.players.map(playerId => {
          let player = players[playerId];
          return player ? `${player.first_name} ${player.last_name}` : "";
        });
      });

      // Pad short rosters to 23 slots (dynasty minimum); leave longer rosters as-is
      for (let i = 1; i <= 16; i++) {
        if (!rostersByTeam[i]) {
          rostersByTeam[i] = Array(23).fill("");
          continue;
        }
        if (rostersByTeam[i].length < 23) {
          rostersByTeam[i].push(...Array(23 - rostersByTeam[i].length).fill(""));
        }
      }

      const sleeperToFantasyPros = new Map(
        playerMappings
          .filter((entry) => entry.Sleeper && entry.Fantasy_Pros)
          .map((entry) => [entry.Sleeper, entry.Fantasy_Pros])
      );

      const playerValuesResponse = await fetch('/Player_Values.txt');
      const playerValuesText = await playerValuesResponse.text();
      const playerValues = Papa.parse(playerValuesText, { header: true, skipEmptyLines: true }).data;
      const historyRows = playerValues
        .filter((entry) => entry.Year && entry.Name)
        .map((entry) => ({
          Year: Number(entry.Year),
          Name: String(entry.Name).trim(),
          Value: parseFloat(entry.Value) || 0,
          Rookie: Number(entry.Rookie) === 1 ? 1 : 0
        }));
      const yearRows = historyRows
        .filter((entry) => String(entry.Year) === valueYear)
        .map((entry) => ({
          Name: entry.Name,
          Value: entry.Value
        }));
      const valueIndexes = {
        ...buildValueIndexes(yearRows),
        sleeperToFantasyPros
      };
      const rookieContracts = buildRookieContracts(historyRows);

      let marketValueByName = new Map();
      try {
        const marketResponse = await fetch(`/fantasypros-${valueYear}.csv`);
        if (marketResponse.ok) {
          marketValueByName = parseFantasyProsMarketCsv(await marketResponse.text());
        }
      } catch (marketError) {
        console.warn('FantasyPros market file not loaded:', marketError);
      }

      const rostersWithValues = {};
      for (const [index, roster] of Object.entries(rostersByTeam)) {
        rostersWithValues[index] = roster
          .map((playerName) => {
            if (!playerName) {
              return {
                name: '',
                value: 0,
                status: 'none',
                label: '',
                formula: '',
                fantasyProsName: ''
              };
            }

            const resolved = resolvePlayerValue(playerName, valueIndexes);
            const breakdown = getContractBreakdown({
              fantasyProsName: resolved.fantasyProsName,
              capYear: valueYear,
              capValue: resolved.value,
              historyRows,
              marketValueByName,
              rookieContracts
            });

            return {
              name: playerName,
              value: resolved.value,
              status: breakdown.status,
              label: breakdown.label,
              formula: breakdown.formula,
              fantasyProsName: resolved.fantasyProsName
            };
          })
          .filter((player) => player.name)
          .sort((a, b) => b.value - a.value);
      }

      // Map manager names
      const rostersWithManagerNames = {};
      for (const [index, roster] of Object.entries(rostersWithValues)) {
        const managerName = managerMap.get(index);
        rostersWithManagerNames[managerName] = roster;
      }
      totalValues = Object.keys(rostersWithManagerNames).map(manager => {
          const totalValue = rostersWithManagerNames[manager].reduce((acc, player) => acc + player.value, 0);
          return { manager, totalValue };
        });

      return rostersWithManagerNames;
    } catch (error) {
      console.error('Error fetching or processing data:', error);
    }
  };
   const createChart = () => {
    const ctx = document.getElementById('chart').getContext('2d');
    if (chart) {
      chart.destroy();
    }

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: totalValues.map(item => item.manager),
        datasets: [
          {
            label: 'Cap Hit',
            data: totalValues.map(item => item.totalValue),
            backgroundColor: totalValues.map(item => item.totalValue <= 600 ? 'blue' : 'red'),
          },
          {
            label: 'Cap Space',
            data: totalValues.map(item => item.totalValue <= 600 ? 600 - item.totalValue : 0),
            backgroundColor: 'orange',
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
          }
        },
        scales: {
          x:{
              stacked: true
          },
          y: {
            stacked: true,
            beginAtZero: true,
            max: Math.max(...totalValues.map(item => item.totalValue)) + 50, // Adjust max to fit the highest value,
            afterDataLimits: scale => {
              scale.max = Math.max(700, scale.max);
            },
            ticks: {
            stepSize: 50
          },

            grid: {
              borderDash: [10, 5],
              drawBorder: false,
              color: function(context) {
                if (context.tick.value === 600) {
                  return '#FF0000'; // Red color for the 600 line
                } else {
                  return Chart.defaults.color;
                }
              }
            }
          }
        }
      }
    });
  };

  onMount(async () => {
    managerRosters = (await fetchData()) ?? {};
    managers = Object.keys(managerRosters);
    if (totalValues.length) {
      createChart();
    }
  });
</script>

<style>
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 40vh; /* Full viewport height */
    box-sizing: border-box; /* Include padding in width */
  }
  .chart-container {
    width: 80%;
    max-height: 50vh;
    justify-content: center;
    align-items:center;
    margin-left:15%;
  }
  .dropdown-container {
    width: 80%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  select {
    margin-bottom: 10px;
    padding: 5px;
    font-size: 14px;
  }

  table {
    width: 90%;
    max-width: 900px;
    border-collapse: collapse;
    overflow-y:auto;
  }

  th, td {
    border: 1px solid #ddd;
    padding: 5px;
    text-align: center;

  }


  .total-value {
    font-weight: bold;
  }

  .rules-legend {
    width: 80%;
    max-width: 720px;
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    font-size: 13px;
    text-align: left;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-sizing: border-box;
  }

  .rules-legend ul {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
  }

  .rules-legend li {
    margin-bottom: 0.25rem;
  }

  .contract-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .contract-rookie_year {
    background: var(--badgeRookieYearBg);
    color: var(--badgeRookieYearText);
  }

  .contract-rookie_y1_2 {
    background: var(--badgeRookieY12Bg);
    color: var(--badgeRookieY12Text);
  }

  .contract-rookie_y3 {
    background: var(--badgeRookieY3Bg);
    color: var(--badgeRookieY3Text);
  }

  .contract-market {
    background: var(--badgeMarketBg);
    color: var(--badgeMarketText);
  }

  .formula-cell {
    font-size: 12px;
    text-align: left;
    max-width: 220px;
  }

  tr.row-rookie_year td {
    background: var(--waiverAdd);
  }

  tr.row-rookie_y1_2 td {
    background: var(--draftSwapped);
  }

  tr.row-rookie_y3 td {
    background: var(--r2);
  }

  @media (max-width: 600px) {
    .chart-container{
      margin-left:0%;
    }
    table {
      font-size: 11px;
      width: 100%;
    }

    th, td {
      padding: 3px;
    }

    .rules-legend {
      width: 100%;
      font-size: 11px;
    }

    .formula-cell {
      max-width: 120px;
    }

    select {
      font-size: 14px;
    }
    .chart-container,
    .dropdown-container {
      width: 100%;
    
  }
  }
</style>

<div class="container">
<h4>Cap Values Summary</h4>
  <div class="rules-legend">
    <strong>Cap contract rules ({valueYear})</strong>
    <ul>
      <li><strong>Rookie year</strong> — league-entry year: locked rookie value</li>
      <li><strong>Rookie deal (yr 1–2)</strong> — years 1–2 since entry: same rookie value</li>
      <li><strong>Rookie deal (yr 3 blend)</strong> — year 3: average of rookie value and Fantasy Pros market</li>
      <li><strong>Market</strong> — year 4+ or no rookie row: full Fantasy Pros market value</li>
    </ul>
  </div>
  <div class="chart-container">
    <canvas id="chart"></canvas>
  </div>
  <div class="dropdown-container">
    <h4>Team Value</h4>
    <select bind:value={selectedManager}>
      <option value="" disabled>Select Manager</option>
      {#each managers as manager}
        <option value={manager}>{manager}</option>
      {/each}
    </select>

    {#if selectedManager}
      <table>
        <thead>
          <tr>
            <th>Player Name</th>
            <th>Value</th>
            <th>Contract</th>
            <th>How calculated</th>
          </tr>
        </thead>
        <tbody>
          {#each managerRosters[selectedManager] as player}
            <tr class="row-{player.status}">
              <td>{player.name}</td>
              <td>{player.value}</td>
              <td>
                {#if player.label}
                  <span class="contract-badge contract-{player.status}">{player.label}</span>
                {/if}
              </td>
              <td class="formula-cell">{player.formula}</td>
            </tr>
          {/each}
          <tr class="total-value">
            <td>Total Value</td>
            <td>{managerRosters[selectedManager].reduce((acc, player) => acc + player.value, 0)}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    {/if}
    <br>
    <br>
  </div>
</div>
