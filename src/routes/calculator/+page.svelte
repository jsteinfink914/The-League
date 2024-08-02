<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';

  let years = [];
  let selectedYear = "2024";
  let data = [];

  // For team comparison
  let team1Selections = Array(7).fill('');
  let team2Selections = Array(7).fill('');
  let team1Values = Array(7).fill(0);
  let team2Values = Array(7).fill(0);
  let team1Total = 0;
  let team2Total = 0;
  let team1Difference = 0;


  let team1Dropdowns = Array(7).fill({ show: false, filteredNames: [] });
  let team2Dropdowns = Array(7).fill({ show: false, filteredNames: [] });


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
      team1Dropdowns[index] = { show: false, filteredNames: [] }; // Hide dropdown after selection
    } else {
      team2Selections[index] = name;
      team2Dropdowns[index] = { show: false, filteredNames: [] }; // Hide dropdown after selection
    }
    updateTeamValues();
  }
  function handleSearchInput(index, team, event) {
    const query = event.target.value.trim().toLowerCase();
    const filteredNames = data
      .filter(item => item.Year === selectedYear)
      .map(item => item.Name)
      .filter(name => name.toLowerCase().includes(query))
      .sort();

    if (team === 1) {
      team1Dropdowns[index] = { show: query.length > 0, filteredNames };
    } else {
      team2Dropdowns[index] = { show: query.length > 0, filteredNames };
    }
  }

  onMount(() => {
    loadData();
  });
</script>

<style>
  /* Center everything on the screen */
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column; /* Stack teams vertically */
  gap: 20px;
  min-height: 100vh; /* Full viewport height */
}

/* Add a bounding box around each team */
.team-container {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  width: 100%; /* Ensure container takes full width */
  max-width: 1200px; /* Optional: limit the maximum width */
  padding: 20px;
  box-sizing: border-box; /* Include padding in width */
}

.team {
  width: 48%;
  border: 2px solid #ddd; /* Bounding box */
  padding: 20px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  border-radius: 8px; /* Optional: rounded corners */
}

.team h3 {
  margin-top: 0;
}

.team-entry {
  margin-bottom: 10px;
}

.team-entry input {
  margin-right: 10px;
  width: calc(100% - 180px); /* Adjust width as needed */
}

.team-summary {
  margin-top: 20px;
  font-weight: bold;
}

.dropdown {
  position: absolute;
  max-height: 200px;
  overflow-y: auto;
  background-color: black;
  border: 1px solid black;
  width: 50%; /* Make dropdown take full width */
  z-index: 1000;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.dropdown-item {
  padding: 10px;
  cursor: pointer;
}

.dropdown-item:hover {
  background-color: lightblue;
}

@media (max-width: 768px) {
  .team-container {
    flex-direction: column;
  }

  .team {
    width: 80%;
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

</style>

<div class="container">
  <div class="team-container">
    <!-- Team 1 -->
    <div class="team">
      <h3>Team 1</h3>
      {#each Array(7).fill().map((_, i) => i) as index}
        <div class="team-entry">
          <input
            type="text"
            placeholder="Type player name..."
            on:input={e => handleSearchInput(index, 1, e)}
            bind:value={team1Selections[index]}
          />
          {#if team1Dropdowns[index].show && team1Dropdowns[index].filteredNames.length > 0}
            <div class="dropdown">
              {#each team1Dropdowns[index].filteredNames as name}
                <div class="dropdown-item" on:click={() => handleTeamSelection(index, 1, name)}>
                  {name}
                </div>
              {/each}
            </div>
          {/if}
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
          <input
            type="text"
            placeholder="Type player name..."
            on:input={e => handleSearchInput(index, 2, e)}
            bind:value={team2Selections[index]}
          />
          {#if team2Dropdowns[index].show && team2Dropdowns[index].filteredNames.length > 0}
            <div class="dropdown">
              {#each team2Dropdowns[index].filteredNames as name}
                <div class="dropdown-item" on:click={() => handleTeamSelection(index, 2, name)}>
                  {name}
                </div>
              {/each}
            </div>
          {/if}
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
