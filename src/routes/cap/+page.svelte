<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';

  let years = [];
  let selectedYear = "2024";
  let searchQuery = "";
  let data = [];
  let previousYearData = [];
  let differenceData = [];
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
  function sortValuesData() {
  data = data.filter(item => item.Year === selectedYear)
              .sort((a, b) => {
                if (valuesSortOrder === 'asc') {
                  return parseFloat(a.Value) - parseFloat(b.Value);
                } else {
                  return parseFloat(b.Value) - parseFloat(a.Value);
                }
              });
  }

  function sortDifferenceData() {
    differenceData = differenceData
                    .sort((a, b) => {
                      if (differenceSortOrder === 'asc') {
                        return a.Difference - b.Difference;
                      } else {
                        return b.Difference - a.Difference;
                      }
                    });
  }

  function handleYearChange(event) {
    selectedYear = event.target.value;
    calculateDifferenceData();
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
    background-color: #f4f4f4;
    cursor: pointer;
  }
  th.sorted-asc::after {
    content: ' ▲';
  }
  th.sorted-desc::after {
    content: ' ▼';
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
          <th on:click={() => sortValuesData()} class={valuesSortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc'}>
            Value
          </th>
        </tr>
      </thead>
      <tbody>
        {#each data.filter(filterData) as item (item.Name)}
          {#if item.Year === selectedYear}
            <tr>
              <td>{item.Name}</td>
              <td>{item.Value}</td>
              <td>{item.Rookie}</td>
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
          <th on:click={() => sortDifferenceData()} class={differenceSortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc'}>
            Difference
          </th>
        </tr>
      </thead>
      <tbody>
        {#each differenceData.filter(filterData) as item (item.Name)}
          <tr>
            <td>{item.Name}</td>
            <td>{item.CurrentValue}</td>
            <td>{item.PreviousValue}</td>
            <td>{item.Difference}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>