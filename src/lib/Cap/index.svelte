<script>
  import { onMount } from 'svelte';
  import Papa from 'papaparse';

  let years = [];
  let selectedYear = "2024";
  let searchQuery = "";
  let data = [];
  let previousYearData = [];
  let differenceData = [];

  // Function to load and parse CSV data
  const loadCSV = async () => {
    try {
      const response = await fetch('/Player_Values.csv'); // Ensure this path is correct
      const csv = await response.text();
      const parsedData = Papa.parse(csv, { header: true }).data;

      // Populate years from parsed data
      years = [...new Set(parsedData.map(d => d.Year))].sort();
      data = parsedData;
      selectedYear = years[0] || "2024";
      filterData();
    } catch (error) {
      console.error("Failed to load CSV data", error);
    }
  };

  // Function to filter data based on year and search query
  const filterData = () => {
    let currentData = data.filter(d => d.Year == selectedYear);
    previousYearData = data.filter(d => d.Year == (selectedYear - 1));

    if (searchQuery) {
      currentData = currentData.filter(d => d["Name"].toLowerCase().includes(searchQuery.toLowerCase()));
    }

    calculateDifferences(currentData);
  };

  // Function to calculate differences between current and previous year data
  const calculateDifferences = (currentData) => {
    differenceData = currentData.map(current => {
      const previous = previousYearData.find(d => d["Name"] === current["Name"]) || {};
      return {
        "Name": current["Name"],
        "Difference": current["Value"] - (previous["Value"] || 0),
      };
    });
  };

  // Load data on component mount
  onMount(loadCSV);

  // Reactively filter data when year or search query changes
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
      {#each data.filter(d => d.Year == selectedYear && (!searchQuery || d["Name"].toLowerCase().includes(searchQuery.toLowerCase()))) as row}
        <tr>
          <td>{row["Name"]}</td>
          <td>{row["Value"]}</td>
          <td>{row["Rookie"]}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <h2>Differences from Previous Year</h2>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Cap Value Difference</th>
      </tr>
    </thead>
    <tbody>
      {#each differenceData as row}
        <tr>
          <td>{row["Name"]}</td>
          <td>{row["Difference"]}</td>
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
