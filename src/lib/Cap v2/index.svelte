<script>
  export let salaryData;
  export let differenceData;
  export let years;
  export let year;

  let searchQuery = "";

  $: filteredSalaryData = salaryData.filter(d => !searchQuery || d.Name.toLowerCase().includes(searchQuery.toLowerCase()));
</script>

<div>
  <label for="year-select">Select Year:</label>
  <select id="year-select" bind:value={year} on:change="{e => year = e.target.value}">
    {#each years as yearOption}
      <option value={yearOption}>{yearOption}</option>
    {/each}
  </select>

  <label for="search-input">Search Player:</label>
  <input id="search-input" type="text" bind:value={searchQuery} placeholder="Type player name (optional)" />

  <h2>Cap Values for {year}</h2>
  <table>
    <thead>
      <tr>
        <th>Player Name</th>
        <th>Cap Value</th>
        <th>Rookie Status</th>
      </tr>
    </thead>
    <tbody>
      {#each filteredSalaryData as row}
        <tr>
          <td>{row.Name}</td>
          <td>{row.Value}</td>
          <td>{row.Rookie}</td>
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
          <td>{row.Name}</td>
          <td>{row.Difference}</td>
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
