<script context="module">
  export async function load({ fetch, params }) {
    const year = params.year || '2024'; // Default to 2024 if no year is provided

    const res = await fetch(`/api/salary-cap?year=${year}`);
    if (!res.ok) {
      throw new Error('Failed to fetch salary cap data');
    }

    const { salaryData, differenceData } = await res.json();

    return {
      props: {
        salaryData,
        differenceData,
        year
      }
    };
  }
</script>

<script>
  export let salaryData;
  export let differenceData;
  export let year;

  let searchQuery = "";
</script>

<div>
  <label for="year-select">Select Year:</label>
  <select id="year-select" bind:value={year} on:change="{e => year = e.target.value}">
    {#each [...new Set(salaryData.map(d => d.Year))] as yearOption}
      <option value={yearOption}>{yearOption}</option>
    {/each}
  </select>

  <label for="search-input">Search Player:</label>
  <input id="search-input" type="text" bind:value={searchQuery} placeholder="Type player name..." />

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
      {#each salaryData.filter(d => !searchQuery || d.Name.toLowerCase().includes(searchQuery.toLowerCase())) as row}
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
