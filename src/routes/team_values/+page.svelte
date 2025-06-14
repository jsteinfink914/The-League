<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  Chart.register(...registerables);

  let managers = [];
  let selectedManager = "";
  let managerRosters = {};
  let totalValues = [];
  let chart;

  const fetchData = async () => {
    try {
      // Fetch rosters
      const rosterResponse = await fetch('https://api.sleeper.app/v1/league/1053526624240517120/rosters');
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

      // Ensure each roster has exactly 23 players
      for (let i = 1; i <= 16; i++) {
        if (rostersByTeam[i].length !== 23) {
          rostersByTeam[i].push(...Array(23 - rostersByTeam[i].length).fill(""));
        }
      }

      // Map player names using the fp_sleeper_mapping.txt
      const playerMap = new Map(playerMappings.map(entry => [entry.Sleeper, entry.Fantasy_Pros]));

      // Fetch player values
      const playerValuesResponse = await fetch('/Player_Values.txt');
      const playerValuesText = await playerValuesResponse.text();
      const playerValues = Papa.parse(playerValuesText, { header: true }).data;
      const playerValueMap = new Map();
                           playerValues.forEach(entry => {
                           if (entry.Year === '2025') {
                          playerValueMap.set(entry.Name, parseFloat(entry.Value) || 0);
                          }
                          });
     // const playerValueMap = new Map(playerValues.map(entry => [entry.Name, entry.Value]));

      // Map player names to values
      const rostersWithValues = {};
      for (const [index, roster] of Object.entries(rostersByTeam)) {
        rostersWithValues[index] = roster.map(playerName => {
          const mappedName = playerMap.get(playerName) || playerName;
          const value = playerValueMap.get(mappedName) || 0;
          return { name: playerName, value: parseFloat(value) };
        }).sort((a, b) => b.value - a.value); 
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
    managerRosters = await fetchData();
    managers = Object.keys(managerRosters);
    createChart();
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
    width: 50%;
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

  @media (max-width: 600px) {
    .chart-container{
      margin-left:0%;
    }
    table {
      font-size: 12px;
    }

    th, td {
      padding: 3px;
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
          </tr>
        </thead>
        <tbody>
          {#each managerRosters[selectedManager] as player}
            <tr>
              <td>{player.name}</td>
              <td>{player.value}</td>
            </tr>
          {/each}
          <tr class="total-value">
            <td>Total Value</td>
            <td>{managerRosters[selectedManager].reduce((acc, player) => acc + player.value, 0)}</td>
          </tr>
        </tbody>
      </table>
    {/if}
    <br>
    <br>
  </div>
</div>
