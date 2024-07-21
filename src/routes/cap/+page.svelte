<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';

  let years = [];
  let selectedYear = "2024";
  let searchQuery = "";
  let data = [];
  let previousYearData = [];
  let differenceData = [];
  let sortedData = [];
  let valuesSortOrder = 'desc'; // 'asc' for ascending, 'desc' for descending
  let differenceSortOrder = 'desc'; // 'asc' for ascending, 'desc' for descending

  // Sample CSV data
  const filePath = '/Player_Values.txt'


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
    calculateDifferenceData();
    sortValuesData(); // Ensure values table is sorted on data update
    sortDifferenceData(); // Ensure differences table is sorted on data update
  };


  function calculateDifferenceData() {
    previousYearData = data.filter(item => item.Year === String(Number(selectedYear) - 1));
    const currentYearData = data.filter(item => item.Year === selectedYear);
    
    differenceData = currentYearData.map(current => {
      const previous = previousYearData.find(p => p.Name === current.Name);
      return {
        Name: current.Name,
        CurrentValue: parseFloat(current.Value),
        PreviousValue: previous ? parseFloat(previous.Value) : 0,
        Difference: previous ? parseFloat(current.Value) - parseFloat(previous.Value) : parseFloat(current.Value)
      };
    });
  }
  function toggleValuesSortOrder() {
  valuesSortOrder = valuesSortOrder === 'asc' ? 'desc' : 'asc';
  sortValuesData();
}

  function toggleDifferenceSortOrder() {
    differenceSortOrder = differenceSortOrder === 'asc' ? 'desc' : 'asc';
    sortDifferenceData();
  }

  function sortValuesData() {
    sortedData = data.filter(item => item.Year === selectedYear)
                .sort((a, b) => {
                  if (valuesSortOrder === 'asc') {
                    return parseFloat(a.Value) - parseFloat(b.Value);
                  } else {
                    return parseFloat(b.Value) - parseFloat(a.Value);
                  }
                });
  }

  function sortDifferenceData() {
    differenceData = differenceData.sort((a, b) => {
      if (differenceSortOrder === 'asc') {
        return a.Difference - b.Difference;
      } else {
        return b.Difference - a.Difference;
      }
    });
  }

  function handleYearChange(event) {
    selectedYear = event.target.value;
    updateData();
  }

  function handleSearchInput(event) {
    searchQuery = event.target.value.toLowerCase();
  }

  function filterData(item) {
    const query = searchQuery.trim().toLowerCase();
    return item.Name.toLowerCase().includes(query);
  }

   // Load data on component mount
  onMount(() => {
    loadData();
  });
</script>

<style>
  .container {
    display: flex;
    justify-content: space-between;
  }
  .table-container {
    width: 45%;
  }
  {body}
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
  th.sorted-asc::after {
    content: ' ▲';
  }
  th.sorted-desc::after {
    content: ' ▼';
  }
  td {
    color: black;
  }
  @media (max-width: 768px) {
  .container {
    flex-direction: column;
    gap: 10px;
  }

  th, td {
    font-size: 14px; /* Adjust font size for smaller screens */
    padding: 8px; /* Reduce padding for smaller screens */
  }

  /* Stack table headers and data vertically on very small screens */
 

  tbody {
    overflow-y: auto;
    max-height: 300px; /* Limit height for scrolling */
  }

  tr {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #ddd;
  }

  td {
    display: block;
    text-align: right;
    border: none; /* Remove borders for stacked rows */
    padding-left: 50%;
    position: relative;
    color: black;
  }

  td::before {
    content: attr(data-label); /* Show data labels for stacked rows */
    position: absolute;
    left: 0;
    width: 50%;
    padding-left: 10px;
    font-weight: bold;
    text-align: left;
  }
}
</style>

<div>
  <label for="year-select">Select Year:</label>
  <select id="year-select" on:change={handleYearChange}>
    {#each years as year}
      <option value={year} selected={year === selectedYear}>{year}</option>
    {/each}
  </select>
  
  <label for="search-input">Search:</label>
  <input id="search-input" type="text" placeholder="Search players..." on:input={handleSearchInput} />
</div>

<div class="container">
  <!-- Values Table -->
  <div class="table-container">
    <h3>Values - {selectedYear}</h3>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th on:click={toggleValuesSortOrder} class={valuesSortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc'}>
            Value
          </th>
          <th>Rookie Status</th>
        </tr>
      </thead>
      <tbody>
        {#each sortedData.filter(filterData) as item (item.Name)}
          {#if item.Year === selectedYear}
            <tr>
              <td data-label="Name">{item.Name}</td>
              <td data-label="Value">{item.Value}</td>
              <td data-label="Rookie Status">{item.Rookie}</td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Differences Table -->
  <div class="table-container">
    <h3>Difference from {Number(selectedYear) - 1} to {selectedYear}</h3>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Current Value</th>
          <th>Previous Value</th>
          <th on:click={toggleDifferenceSortOrder} class={differenceSortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc'}>
            Difference
          </th>
        </tr>
      </thead>
      <tbody>
        {#each differenceData.filter(filterData) as item (item.Name)}
          <tr>
            <td data-label="Name">{item.Name}</td>
            <td data-label="Current Value">{item.CurrentValue}</td>
            <td data-label="Previous Value">{item.PreviousValue}</td>
            <td data-label="Difference">{item.Difference}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>