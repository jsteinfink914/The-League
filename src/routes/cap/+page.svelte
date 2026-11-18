<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { createSetParams } from '$lib/utils/urlParams';

  // Filters and sort live in the URL query string so views are shareable.
  const setParams = createSetParams(page);
  const initParams = $page.url.searchParams;

  let years = [];
  let selectedYear = initParams.get('year') || "2026";
  let searchQuery = initParams.get('q') || "";
  let data = [];
  let rows = [];
  let sortKey = ['value', 'ly', 'diff', 'name'].includes(initParams.get('sort')) ? initParams.get('sort') : 'value';
  let sortDir = initParams.get('dir') === 'asc' ? 'asc' : 'desc';

  const filePath = '/Player_Values.txt'

  const fmtDiff = (d) => d > 0 ? `+$${d}` : d < 0 ? `-$${Math.abs(d)}` : '$0';

  const loadData = async () => {
    const response = await fetch(filePath);
    const text = await response.text();
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        data = result.data;
        years = [...new Set(data.map(row => row.Year))].sort();
        buildRows();
      }
    });
  };

  // One merged row per player: this year's value, last year's value, and the
  // change — the two old side-by-side tables joined on the player.
  function buildRows() {
    const prev = new Map(
      data.filter(item => item.Year === String(Number(selectedYear) - 1))
        .map(item => [item.Name, parseFloat(item.Value)])
    );
    rows = data.filter(item => item.Year === selectedYear).map(item => {
      const value = parseFloat(item.Value);
      const ly = prev.has(item.Name) ? prev.get(item.Name) : 0;
      return {
        Name: item.Name,
        Value: value,
        LY: ly,
        Difference: Math.round((value - ly) * 100) / 100,
        Rookie: item.Rookie
      };
    });
  }

  const comparators = {
    value: (a, b) => a.Value - b.Value,
    ly: (a, b) => a.LY - b.LY,
    diff: (a, b) => a.Difference - b.Difference,
    name: (a, b) => a.Name.localeCompare(b.Name)
  };

  $: sortedRows = rows
    .filter(item => item.Name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .sort((a, b) => {
      const cmp = comparators[sortKey](a, b);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  function applySort(key, dir) {
    sortKey = key;
    sortDir = dir;
    setParams({
      sort: key === 'value' && dir === 'desc' ? null : key,
      dir: key === 'value' && dir === 'desc' ? null : dir
    });
  }

  function headerSort(key) {
    if (sortKey === key) {
      applySort(key, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      applySort(key, key === 'name' ? 'asc' : 'desc');
    }
  }

  function handleYearChange(event) {
    selectedYear = event.target.value;
    setParams({ year: selectedYear === "2026" ? null : selectedYear });
    buildRows();
  }

  function handleSearchInput(event) {
    searchQuery = event.target.value;
    setParams({ q: searchQuery.trim() || null });
  }

   // Load data on component mount
  onMount(() => {
    loadData();
  });
</script>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 20px;
    align-items: flex-end;
    margin-bottom: 10px;
  }
  .controls label {
    font-weight: 600;
    margin-right: 6px;
  }
  .controls select,
  .controls input {
    padding: 7px 10px;
    border: 1px solid var(--ddd);
    border-radius: 6px;
    background: var(--fff);
    color: inherit;
    font: inherit;
  }
  #search-input {
    min-width: 220px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }
  .chip {
    padding: 6px 12px;
    border: 1px solid var(--ddd);
    border-radius: 999px;
    background: var(--fff);
    color: inherit;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .chip.active {
    background: var(--headerPrimary);
    border-color: var(--blueOne);
  }
  .legend {
    margin: 0 0 12px;
    font-size: 13px;
    opacity: 0.75;
  }
  .scroll-wrap {
    max-height: 65vh;
    overflow: auto;
    border-radius: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th, td {
    padding: 8px 10px;
    text-align: center;
  }
  th:first-child, td:first-child {
    text-align: left;
  }
  th:nth-child(1) { width: 46%; }
  th:nth-child(2) { width: 18%; }
  th:nth-child(3) { width: 18%; }
  th:nth-child(4) { width: 18%; }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--headerPrimary);
    cursor: pointer;
  }
  th.sorted-asc::after {
    content: ' ▲';
  }
  th.sorted-desc::after {
    content: ' ▼';
  }
  .diff-pos { color: #27ae60; font-weight: 600; }
  .diff-neg { color: #c1121f; font-weight: 600; }
  .rookie-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    vertical-align: 2px;
    background: var(--badgeRookieYearBg);
    color: var(--badgeRookieYearText);
  }
  .empty-row td {
    text-align: center;
    opacity: 0.7;
    padding: 20px 10px;
  }

  @media (max-width: 768px) {
    .scroll-wrap {
      max-height: 60vh;
    }
    th, td {
      padding: 7px 6px;
      font-size: 13px;
    }
    #search-input {
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
    }
    .search-field {
      flex: 1 1 200px;
    }
  }
</style>

<h1>Player Values</h1>

<div class="controls">
  <div>
    <label for="year-select">Select Year:</label>
    <select id="year-select" on:change={handleYearChange}>
      {#each years as year}
        <option value={year} selected={year === selectedYear}>{year}</option>
      {/each}
    </select>
  </div>
  <div class="search-field">
    <label for="search-input">Search:</label>
    <input id="search-input" type="text" placeholder="Search players..." value={searchQuery} on:input={handleSearchInput} />
  </div>
</div>

<div class="chips">
  <button class="chip" class:active={sortKey === 'value' && sortDir === 'desc'} on:click={() => applySort('value', 'desc')}>Top values</button>
  <button class="chip" class:active={sortKey === 'diff' && sortDir === 'desc'} on:click={() => applySort('diff', 'desc')}>Biggest movers</button>
  <button class="chip" class:active={sortKey === 'diff' && sortDir === 'asc'} on:click={() => applySort('diff', 'asc')}>Biggest fallers</button>
</div>

<p class="legend">LY = {Number(selectedYear) - 1} value · Diff = change vs LY · <span class="rookie-badge">R</span> = rookie · {sortedRows.length} players</p>

<div class="scroll-wrap">
  <table class="league-table">
    <thead>
      <tr>
        <th on:click={() => headerSort('name')} class={sortKey === 'name' ? (sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : ''}>Name</th>
        <th on:click={() => headerSort('value')} class={sortKey === 'value' ? (sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : ''}>Value</th>
        <th on:click={() => headerSort('ly')} class={sortKey === 'ly' ? (sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : ''}>LY</th>
        <th on:click={() => headerSort('diff')} class={sortKey === 'diff' ? (sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : ''}>Diff</th>
      </tr>
    </thead>
    <tbody>
      {#each sortedRows as item (item.Name)}
        <tr>
          <td data-label="Name">{item.Name}{#if item.Rookie === '1' || item.Rookie === 1}<span class="rookie-badge">R</span>{/if}</td>
          <td data-label="Value">${item.Value}</td>
          <td data-label="LY Value">${item.LY}</td>
          <td data-label="Difference" class={item.Difference > 0 ? 'diff-pos' : item.Difference < 0 ? 'diff-neg' : ''}>{fmtDiff(item.Difference)}</td>
        </tr>
      {:else}
        <tr class="empty-row"><td colspan="4">No players match "{searchQuery}" in {selectedYear}.</td></tr>
      {/each}
    </tbody>
  </table>
</div>
