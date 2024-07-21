<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';

  let years = [];
  let selectedYear = "2024";
  let searchQuery = "";
  let data = [];
  let previousYearData = [];
  let differenceData = [];
  let sortedData = []; // Add this for sorted values

  onMount(async () => {
    const response = await fetch('/Player_Values.txt');
    const csvText = await response.text();
    parseCSV(csvText);
  });

  function parseCSV(csvText) {
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      complete: function(results) {
        data = results.data;
        processData();
      }
    });
  }

  function processData() {
    const yearSet = new Set();
    data.forEach(player => {
      yearSet.add(player.Year);
    });
    years = Array.from(yearSet).sort().reverse();

    updatePreviousYearData();
    updateDifferenceData();
    updateSortedData(); // Ensure sortedData is updated
  }

  function updatePreviousYearData() {
    previousYearData = data.filter(player => player.Year === selectedYear - 1);
  }

  function updateDifferenceData() {
    differenceData = data.filter(player => player.Year === selectedYear).map(player => {
      const prevPlayer = previousYearData.find(p => p.Name === player.Name) || {};
      return {
        ...player,
        ValueDifference: player.Value - (prevPlayer.Value || 0)
      };
    });
    // Ensure differenceData is sorted
    differenceData.sort((a, b) => b.ValueDifference - a.ValueDifference);
  }

  function updateSortedData() {
    sortedData = data
      .filter(player => player.Year === selectedYear)
      .sort((a, b) => b.Value - a.Value);
  }

  function handleYearChange(event) {
    selectedYear = event.target.value;
    updatePreviousYearData();
    updateDifferenceData();
    updateSortedData(); // Call this function to update the sortedData
  }

  function handleSearchChange(event) {
    searchQuery = event.target.value.toLowerCase();
  }
</script>

<main>
  <div>
    <label for="year-select">Select Year:</label>
    <select id="year-select" bind:value={selectedYear} on:change={handleYearChange}>
      {#each years as year}
        <option value={year}>{year}</option>
      {/each}
    </select>
  </div>

  <div>
    <input type="text" placeholder="Search player" bind:value={searchQuery} on:input={handleSearchChange} />
  </div>

  <div class="tables">
    <div class="table">
      <h3>Values</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
            <th>Rookie</th>
          </tr>
        </thead>
        <tbody>
          {#each sortedData.filter(player => player.Name.toLowerCase().includes(searchQuery)) as player}
            <tr>
              <td>{player.Name}</td>
              <td>{player.Value}</td>
              <td>{player.Rookie}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="table">
      <h3>Differences</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Value Difference</th>
          </tr>
        </thead>
        <tbody>
          {#each differenceData.filter(player => player.Name.toLowerCase().includes(searchQuery)) as player}
            <tr>
              <td>{player.Name}</td>
              <td>{player.ValueDifference}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</main>

<style>
  .tables {
    display: flex;
  }
  .table {
    flex: 1;
    margin: 0 1rem;
  }
</style>
