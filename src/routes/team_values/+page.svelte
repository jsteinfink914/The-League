<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';

  let managers = [];
  let selectedManager = "";
  let managerRosters = {};

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
      const playerValueMap = new Map(playerValues.map(entry => [entry.Name, entry.Value]));

      // Map player names to values
      const rostersWithValues = {};
      for (const [index, roster] of Object.entries(rostersByTeam)) {
        rostersWithValues[index] = roster.map(playerName => {
          const mappedName = playerMap.get(playerName) || playerName;
          const value = playerValueMap.get(mappedName) || 0;
          return { name: playerName, value: parseFloat(value) };
        });
      }

      // Map manager names
      const rostersWithManagerNames = {};
      for (const [index, roster] of Object.entries(rostersWithValues)) {
        const managerName = managerMappings.get(index);
        rostersWithManagerNames[managerName] = roster;
      }

      return rostersWithManagerNames;
    } catch (error) {
      console.error('Error fetching or processing data:', error);
    }
  };

  onMount(async () => {
    managerRosters = await fetchData();
    managers = Object.keys(managerRosters);
  });
</script>

<style>
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
  }

  select {
    margin-bottom: 20px;
    padding: 10px;
    font-size: 16px;
  }

  ul {
    list-style: none;
    padding: 0;
  }

  li {
    margin: 5px 0;
    font-size: 16px;
  }
</style>

<div class="container">
  <h1>Fantasy Football Team Roster</h1>

  <select bind:value={selectedManager}>
    <option value="" disabled>Select Manager</option>
    {#each managers as manager}
      <option value={manager}>{manager}</option>
    {/each}
  </select>

  {#if selectedManager}
    <ul>
      {#each managerRosters[selectedManager] as player}
        <li>{player.name}: {player.value}</li>
      {/each}
      <li>Total Value: {managerRosters[selectedManager].reduce((acc, player) => acc + player.value, 0)}</li>
    </ul>
  {/if}
</div>
