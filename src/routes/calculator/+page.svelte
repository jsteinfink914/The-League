<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';
  import { fetchWithTimeout } from '$lib/utils/helperFunctions/network';

  let years = [];
  let selectedYear = "";
  let data = [];

  // For team comparison
  let team1Selections = Array(7).fill('');
  let team2Selections = Array(7).fill('');
  let team1Values = Array(7).fill(0);
  let team2Values = Array(7).fill(0);
  let team1Total = 0;
  let team2Total = 0;
  let team1Difference = 0;

  let team1Dropdowns = createDropdowns();
  let team2Dropdowns = createDropdowns();
  let loading = true;
  let errorMessage = '';

  const filePath = '/Player_Values.txt';

  function createDropdowns() {
    return Array.from({ length: 7 }, () => ({ show: false, filteredNames: [], activeIndex: 0 }));
  }

  const loadData = async () => {
    loading = true;
    errorMessage = '';
    try {
      const response = await fetchWithTimeout(filePath);

      const result = Papa.parse(await response.text(), {
        header: true,
        skipEmptyLines: true
      });
      if (result.errors?.length) {
        throw new Error('The player values file could not be parsed.');
      }

      data = result.data;
      years = [...new Set(data.map(row => row.Year))]
        .filter(Boolean)
        .sort((a, b) => Number(b) - Number(a));
      selectedYear = years[0] || "";
      updateData();
    } catch (error) {
      console.error('Unable to load calculator values:', error);
      errorMessage = error.message || 'Unable to load player values.';
    } finally {
      loading = false;
    }
  };

  const updateData = () => {
    updateTeamValues(); // Update team values
  };

  function updateTeamValues() {
    team1Values = team1Selections.map(name => {
      const player = data.find(item => item.Name === name && item.Year === selectedYear);
      const value = player ? parseFloat(player.Value) : 0;
      return Number.isFinite(value) ? value : 0;
    });

    team2Values = team2Selections.map(name => {
      const player = data.find(item => item.Name === name && item.Year === selectedYear);
      const value = player ? parseFloat(player.Value) : 0;
      return Number.isFinite(value) ? value : 0;
    });

    team1Total = team1Values.reduce((acc, value) => acc + value, 0);
    team2Total = team2Values.reduce((acc, value) => acc + value, 0);
    team1Difference = team1Total - team2Total;
  }

  function handleTeamSelection(index, team, name) {
    if (team === 1) {
      team1Selections = team1Selections.map((selection, selectionIndex) =>
        selectionIndex === index ? name : selection
      );
      team1Dropdowns = team1Dropdowns.map((dropdown, dropdownIndex) =>
        dropdownIndex === index ? { show: false, filteredNames: [], activeIndex: 0 } : dropdown
      );
    } else {
      team2Selections = team2Selections.map((selection, selectionIndex) =>
        selectionIndex === index ? name : selection
      );
      team2Dropdowns = team2Dropdowns.map((dropdown, dropdownIndex) =>
        dropdownIndex === index ? { show: false, filteredNames: [], activeIndex: 0 } : dropdown
      );
    }
    updateTeamValues();
  }

  function clearSelection(index, team) {
    handleSearchInput(index, team, { currentTarget: { value: '' } });
  }

  function handleSearchInput(index, team, event) {
    const value = event.currentTarget.value;
    const query = value.trim().toLowerCase();
    const filteredNames = [...new Set(data
      .filter(item => item.Year === selectedYear)
      .map(item => item.Name)
      .filter(name => name && name.toLowerCase().includes(query))
      .sort())].slice(0, 8);

    if (team === 1) {
      team1Selections = team1Selections.map((selection, selectionIndex) =>
        selectionIndex === index ? value : selection
      );
      team1Dropdowns = team1Dropdowns.map((dropdown, dropdownIndex) =>
        dropdownIndex === index
          ? { show: query.length > 0, filteredNames, activeIndex: 0 }
          : dropdown
      );
    } else {
      team2Selections = team2Selections.map((selection, selectionIndex) =>
        selectionIndex === index ? value : selection
      );
      team2Dropdowns = team2Dropdowns.map((dropdown, dropdownIndex) =>
        dropdownIndex === index
          ? { show: query.length > 0, filteredNames, activeIndex: 0 }
          : dropdown
      );
    }
    updateTeamValues();
  }

  function handleDropdownKeydown(event, team, index) {
    const dropdown = team === 1 ? team1Dropdowns[index] : team2Dropdowns[index];
    if (!dropdown.show || !dropdown.filteredNames.length) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleTeamSelection(index, team, '');
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const activeIndex = (dropdown.activeIndex + direction + dropdown.filteredNames.length) % dropdown.filteredNames.length;
      const nextDropdown = { ...dropdown, activeIndex };
      if (team === 1) {
        team1Dropdowns = team1Dropdowns.map((item, itemIndex) => itemIndex === index ? nextDropdown : item);
      } else {
        team2Dropdowns = team2Dropdowns.map((item, itemIndex) => itemIndex === index ? nextDropdown : item);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      handleTeamSelection(index, team, dropdown.filteredNames[dropdown.activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleTeamSelection(index, team, team === 1 ? team1Selections[index] : team2Selections[index]);
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
  justify-content: flex-start;
  align-items: stretch;
  flex-direction: column; /* Stack teams vertically */
  gap: 20px;
  min-height: 60vh;
  padding: 1rem 0 2rem;
}

/* Add a bounding box around each team */
.team-container {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  width: 100%; /* Ensure container takes full width */
  max-width: 1200px; /* Optional: limit the maximum width */
  padding: 20px;
  box-sizing: border-box; /* Include padding in width */
}

.calculator-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 1200px;
  padding: 20px 20px 0;
  box-sizing: border-box;
  font-weight: 600;
}

.calculator-controls select {
  padding: 6px 10px;
  border: 1px solid #bbb;
  border-radius: 4px;
  background: white;
  color: #222;
  font: inherit;
}

.team {
  min-width: 0;
  border: 2px solid #ddd; /* Bounding box */
  padding: 20px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  border-radius: 8px; /* Optional: rounded corners */
}

.team h3 {
  margin-top: 0;
}

.team-entry {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.input-wrap {
  position: relative;
  min-width: 0;
}

.team-entry input {
  width: 100%;
  min-height: 38px;
  box-sizing: border-box;
  padding: 8px 34px 8px 10px;
}

.value {
  white-space: nowrap;
}

.team-summary {
  margin-top: 20px;
  font-weight: bold;
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  max-height: 200px;
  overflow-y: auto;
  width: 100%;
  box-sizing: border-box;
  background-color: var(--fff);
  color: var(--g111);
  border: 1px solid #777;
  z-index: 1000;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.dropdown-item:hover,
.dropdown-item:focus-visible {
  background-color: lightblue;
  outline: none;
}

.clear-button {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.clear-button:hover,
.clear-button:focus-visible {
  background: rgba(0, 49, 107, 0.12);
  outline: 2px solid currentColor;
  outline-offset: 1px;
}

.status {
  width: min(100% - 2rem, 1160px);
  margin: 0 auto;
  padding: 1rem;
  box-sizing: border-box;
  text-align: center;
}

.error-state {
  border: 1px solid #b00020;
  border-radius: 6px;
  color: #b00020;
}

.retry-button {
  margin-top: 0.75rem;
  padding: 0.6rem 1rem;
  border: 0;
  border-radius: 4px;
  background: #00316b;
  color: white;
  cursor: pointer;
}

@media (max-width: 768px) {
  .team-container {
    grid-template-columns: 1fr;
    padding: 0 1rem;
  }

  .team {
    width: 100%;
    padding: 1rem;
    box-sizing: border-box;
  }

  .calculator-controls {
    padding: 0 1rem;
  }
}

</style>

<div class="container">
  {#if loading}
    <div class="status" role="status">Loading player values…</div>
  {:else if errorMessage}
    <div class="status error-state" role="alert">
      <div>{errorMessage}</div>
      <button class="retry-button" type="button" on:click={loadData}>Retry</button>
    </div>
  {:else}
    <div class="calculator-controls">
      <label for="value-year">Value year</label>
      <select id="value-year" bind:value={selectedYear} on:change={updateData} disabled={years.length === 0}>
        {#each years as year}
          <option value={year}>{year}{year === years[0] ? ' (current)' : ''}</option>
        {/each}
      </select>
    </div>

    <div class="team-container">
    <!-- Team 1 -->
    <div class="team">
      <h3>Team 1</h3>
      {#each Array(7).fill().map((_, i) => i) as index}
        <div class="team-entry">
          <div class="input-wrap">
            <label class="sr-only" for="team1-player-{index}">Team 1 player {index + 1}</label>
            <input
              id="team1-player-{index}"
              type="text"
              placeholder="Type player name..."
              autocomplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="team1-options-{index}"
              aria-expanded={team1Dropdowns[index].show}
              on:input={e => handleSearchInput(index, 1, e)}
              on:keydown={e => handleDropdownKeydown(e, 1, index)}
              bind:value={team1Selections[index]}
            />
            {#if team1Selections[index]}
              <button class="clear-button" type="button" aria-label="Clear Team 1 player {index + 1}" on:click={() => clearSelection(index, 1)}>×</button>
            {/if}
            {#if team1Dropdowns[index].show}
              {#if team1Dropdowns[index].filteredNames.length > 0}
                <div class="dropdown" id="team1-options-{index}" role="listbox">
                  {#each team1Dropdowns[index].filteredNames as name, nameIndex}
                    <button class="dropdown-item" type="button" role="option" aria-selected={nameIndex === team1Dropdowns[index].activeIndex} on:click={() => handleTeamSelection(index, 1, name)}>
                      {name}
                    </button>
                  {/each}
                </div>
              {:else}
                <div class="dropdown" role="status">No matching players</div>
              {/if}
            {/if}
          </div>
          <span class="value">Value: {team1Values[index]}</span>
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
          <div class="input-wrap">
            <label class="sr-only" for="team2-player-{index}">Team 2 player {index + 1}</label>
            <input
              id="team2-player-{index}"
              type="text"
              placeholder="Type player name..."
              autocomplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="team2-options-{index}"
              aria-expanded={team2Dropdowns[index].show}
              on:input={e => handleSearchInput(index, 2, e)}
              on:keydown={e => handleDropdownKeydown(e, 2, index)}
              bind:value={team2Selections[index]}
            />
            {#if team2Selections[index]}
              <button class="clear-button" type="button" aria-label="Clear Team 2 player {index + 1}" on:click={() => clearSelection(index, 2)}>×</button>
            {/if}
            {#if team2Dropdowns[index].show}
              {#if team2Dropdowns[index].filteredNames.length > 0}
                <div class="dropdown" id="team2-options-{index}" role="listbox">
                  {#each team2Dropdowns[index].filteredNames as name, nameIndex}
                    <button class="dropdown-item" type="button" role="option" aria-selected={nameIndex === team2Dropdowns[index].activeIndex} on:click={() => handleTeamSelection(index, 2, name)}>
                      {name}
                    </button>
                  {/each}
                </div>
              {:else}
                <div class="dropdown" role="status">No matching players</div>
              {/if}
            {/if}
          </div>
          <span class="value">Value: {team2Values[index]}</span>
        </div>
      {/each}
      <div class="team-summary">
        <p>Total Value: {team2Total}</p>
        <p>Difference (Team 1 - Team 2): {team1Difference}</p>
      </div>
    </div>
    </div>
  {/if}
</div>
