<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';

  let years = [];
  let selectedYear = "2024";
  let searchQuery = "";
  let data = [];

  // For team comparison
  let team1Selections = Array(7).fill('');
  let team2Selections = Array(7).fill('');
  let team1Values = Array(7).fill(0);
  let team2Values = Array(7).fill(0);
  let team1Total = 0;
  let team2Total = 0;
  let team1Difference = 0;

  const filePath = '/Player_Values.txt';

  const loadData = async () => {
    const response = await fetch(filePath);
    const text = await response.text();
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        data = result.data;
        years = [...new Set(data.map(row => row.Year))].sort();
        updateData();
      }
    });
  };

  const updateData = () => {
    updateTeamValues(); // Update team values
  };

  function updateTeamValues() {
    team1Values = team1Selections.map(name => {
      const player = data.find(item => item.Name === name && item.Year === selectedYear);
      return player ? parseFloat(player.Value) : 0;
    });

    team2Values = team2Selections.map(name => {
      const player = data.find(item => item.Name === name && item.Year === selectedYear);
      return player ? parseFloat(player.Value) : 0;
    });

    team1Total = team1Values.reduce((acc, value) => acc + value, 0);
    team2Total = team2Values.reduce((acc, value) => acc + value, 0);
    team1Difference = team1Total - team2Total;
  }

  function handleTeamSelection(index, team, name) {
    if (team === 1) {
      team1Selections[index] = name;
    } else {
      team2Selections[index] = name;
    }
    updateTeamValues();
  }

  onMount(() => {
    loadData();
  });
</script>

<style>
  .container {
    display: flex;
    justify-content: space-between;
    gap: 20px;
  }
  .table-container {
    width: 45%;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  th, td {
    padding: 10px;
    border: 1px solid #ddd;
  }
  th {
    background-color: black;
    color: white;
    font-weight: bold;
    cursor: pointer;
  }
  tr:nth-child(even) {
    background-color: #f9f9f9;
  }
  tr:nth-child(odd) {
    background-color: white;
  }
  td {
    color: black;
  }
  .dropdown {
    position: absolute;
    max-height: 200px;
    overflow-y: auto;
    background-color: lightblue;
    border: 1px solid black;
    width: 20%;
    z-index: 1000;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  .dropdown-item {
    padding: 10px;
    cursor: pointer;
  }

  .dropdown-item:hover {
    background-color: #f0f0f0;
  }

  @media (max-width: 768px) {
    .container {
      flex-direction: column;
    }

    .table-container {
      width: 100%;
    }

    th, td {
      font-size: 14px;
      padding: 8px;
    }

    tbody {
      overflow-y: auto;
      overflow-x: auto;
      max-height: 300px;
    }

    tr {
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid #ddd;
    }

    td {
      display: block;
      text-align: right;
      border: none;
      padding-left: 50%;
      position: relative;
      color: black;
    }

    td::before {
      content: attr(data-label);
      position: absolute;
      left: 0;
      width: 50%;
      padding-left: 10px;
      font-weight: bold;
      text-align: left;
    }
  }

  .team-container {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin-top: 20px;
  }

  .team {
    width: 45%;
  }

  .team-entry {
    margin-bottom: 10px;
  }

  .team-entry select {
    margin-right: 10px;
  }

  .team-summary {
    margin-top: 20px;
    font-weight: bold;
  }

  @media (max-width: 768px) {
    .team-container {
      flex-direction: column;
    }

    .team {
      width: 100%;
    }
  }
</style>

<div class="container">
  <!-- Team 1 -->
  <div class="team-container">
    <div class="team">
      <h3>Team 1</h3>
      {#each Array(7).fill().map((_, i) => i) as index}
        <div class="team-entry">
          <select on:change={e => handleTeamSelection(index, 1, e.target.value)}>
            <option value="">Select Player</option>
            {#each filteredNames as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
          <span>Value: {team1Values[index]}</span>
        </div>
      {/each}
      <div class="team-summary">
        <p>Total Value: {team1Total}</p>
      </div>
    </div>

    <!-- Team 2 -->
    <div class="team">
      <h3>Team 2</h3>
      {#each Array(7).fill().map((_, i) => i) as index}
        <div class="team-entry">
          <select on:change={e => handleTeamSelection(index, 2, e.target.value)}>
            <option value="">Select Player</option>
            {#each filteredNames as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
          <span>Value: {team2Values[index]}</span>
        </div>
      {/each}
      <div class="team-summary">
        <p>Total Value: {team2Total}</p>
        <p>Difference (Team 1 - Team 2): {team1Difference}</p>
      </div>
    </div>
  </div>
</div>
