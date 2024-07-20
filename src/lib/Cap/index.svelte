<script>
  import { onMount } from 'svelte';

  let data = [];

  onMount(async () => {
    const res = await fetch('/cap');
    if (res.ok) {
      data = await res.json();
    } else {
      console.error('Failed to fetch data');
    }
  });
</script>

<div>
  <h2>Test CSV Data</h2>
  <ul>
    {#each data as row}
      <li>{row.Year} - {row.Name} - {row.Value} - {row.Rookie}</li>
    {/each}
  </ul>
</div>
