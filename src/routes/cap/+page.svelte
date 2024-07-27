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
  let filteredNames = [];
  let showDropdown = false;

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
  function filterNames() {
    filteredNames = data
      .filter(item => item.Year === selectedYear)
      .map(item => item.Name)
      .filter(name => name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort();
  }

  function handleSearchInput(event) {
    searchQuery = event.target.value.toLowerCase();
    filterNames();
    showDropdown = searchQuery.length > 0;
  }

  function handleNameSelect(name) {
    searchQuery = name;
    showDropdown = false;
    updateData(); // Ensure the data updates based on the selected name
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
    flex-wrap: warap;
    gap: 10px;
  }
  .table-container {
    width: 48%;
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
  
  th.sorted-asc::after {
    content: ' ▲';
  }
  th.sorted-desc::after {
    content: ' ▼';
  }

  .dropdown {
  position: absolute;
  max-height: 200px;
  overflow-y: auto;
  background-color: lightgray;
  border: black;
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
    flex-direction: row;
    gap: 2px;
  }

  .table-container {
    width: 90%;
  }

  th, td {
    font-size: 10px; /* Adjust font size for smaller screens */
    padding: 2px; /* Reduce padding for smaller screens */
  }

  /* Stack table headers and data vertically on very small screens */
 

  tbody {
    overflow-y: auto;
    overflow-x: auto;
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
  }

  td::before {
    position: absolute;
    left: 0;
    width: 90%;
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
    <div style="position: relative; width: 100%;">
    <label for="year-select">Search:</label>
    <input id="search-input" type="text" placeholder="Search players..." on:input={handleSearchInput} />
    {#if showDropdown && filteredNames.length > 0}
      <div class="dropdown">
        {#each filteredNames as name}
          <div class="dropdown-item" on:click={() => handleNameSelect(name)}>
            {name}
          </div>
        {/each}
      </div>
    {/if}
  </div>
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
    <h3>{Number(selectedYear) - 1} to {selectedYear} Change</h3>
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