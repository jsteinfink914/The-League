<script>
  import { onMount } from 'svelte';
  import Papa from 'papaparse';
  import { writable } from 'svelte/store';

  let years = [];
  let selectedYear = "2024";
  let searchQuery = "";
  let data = [];
  let previousYearData = [];
  let differenceData = [];

  const loadCSV = async () => {
    const response = await fetch('/Player_Values.csv'); // Update the path to your CSV file
    const csv = await response.text();
    const parsedData = Papa.parse(csv, { header: true }).data;

    years = [...new Set(parsedData.map(d => d.Year))];
    data = parsedData;
    selectedYear = years[0];
    filterData();
  };

  const filterData = () => {
    const currentData = data.filter(d => d.Year == selectedYear);
    previousYearData = data.filter(d => d.Year == (selectedYear - 1));

    if (searchQuery) {
      currentData = currentData.filter(d => d["Name"].toLowerCase().includes(searchQuery.toLowerCase()));
    }

    calculateDifferences(currentData);
  };

  const calculateDifferences = (currentData) => {
    differenceData = currentData.map(current => {
      const previous = previousYearData.find(d => d["Name"] == current["Name"]) || {};
      return {
        "Name": current["Name"],
        "Difference": current["value"] - (previous["Value"] || 0),
      };
    });
  };

  onMount(loadCSV);

  $: filterData();
</script>

<div>
  <label for="year-select">Select Year:</label>
  <select id="year-select" bind:value={selectedYear}>
    {#each years as year}
      <option value={year}>{year}</option>
    {/each}
  </select>

  <label for="search-input">Search Player:</label>
  <input id="search-input" type="text" bind:value={searchQuery} placeholder="Type player name..." />

  <h2>Cap Values for {selectedYear}</h2>
  <table>
    <thead>
      <tr>
        <th>Player Name</th>
        <th>Cap Value</th>
        <th>Rookie Status</th>
      </tr>
    </thead>
    <tbody>
      {#each data.filter(d => d.Year == selectedYear && (!searchQuery || d["player name"].toLowerCase().includes(searchQuery.toLowerCase()))) as row}
        <tr>
          <td>{row["player name"]}</td>
          <td>{row["cap value"]}</td>
          <td>{row["rookie status"]}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <h2>Differences from Previous Year</h2>
  <table>
    <thead>
      <tr>
        <th>Player Name</th>
        <th>Cap Value Difference</th>
      </tr>
    </thead>
    <tbody>
      {#each differenceData as row}
        <tr>
          <td>{row["player name"]}</td>
          <td>{row["cap value difference"]}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    border: 1px solid #ddd;
    padding: 8px;
  }

  th {
    background-color: #f2f2f2;
  }

  tr:hover {
    background-color: #f1f1f1;
  }
</style>
