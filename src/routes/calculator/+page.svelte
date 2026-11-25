<script>
  import Papa from 'papaparse';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { createSetParams } from '$lib/utils/urlParams';
  import { leagueID } from '$lib/utils/leagueInfo';
  import { fetchWithRetry } from '$lib/utils/helperFunctions/request';
  import { loadPlayers } from '$lib/utils/helperFunctions/players';
  import { normalizeName } from '$lib/utils/playerNameLookup';

  // Selections live in the URL query string so a built comparison is a
  // shareable link: ?t1=Name,Name&t2=Name&year=2025
  const setParams = createSetParams(page);
  const initParams = $page.url.searchParams;

  const MAX_PER_SIDE = 8;
  const filePath = '/Player_Values.txt';

  let years = [];
  let selectedYear = "";
  let data = [];
  let loading = true;
  let loadError = '';

  let team1 = [];
  let team2 = [];
  let query1 = '';
  let query2 = '';

  // Roster quick-add: manager -> player names, from Sleeper + Manager_map.
  let managerRosters = [];
  let rostersLoading = true;
  let rosterPick1 = '';
  let rosterPick2 = '';

  // Values are indexed by normalized name: the values file uses FantasyPros
  // spellings ("Patrick Mahomes II") while Sleeper rosters drop suffixes
  // ("Patrick Mahomes") — normalizeName (the site's shared helper) joins them.
  let valueIndex = new Map();
  $: {
    valueIndex = new Map();
    for (const row of data) {
      if (row.Year !== selectedYear) continue;
      const key = normalizeName(row.Name);
      if (!valueIndex.has(key)) valueIndex.set(key, row.Value);
    }
  }
  const valueOf = (name) => {
    const v = valueIndex.get(normalizeName(name));
    return Number.isFinite(v) ? v : null;
  };

  $: placedNorm = new Set([...team1, ...team2].map(normalizeName));
  $: team1Resolved = team1.map(name => ({ name, value: valueOf(name) }));
  $: team2Resolved = team2.map(name => ({ name, value: valueOf(name) }));
  $: team1Total = team1Resolved.reduce((acc, p) => acc + (p.value ?? 0), 0);
  $: team2Total = team2Resolved.reduce((acc, p) => acc + (p.value ?? 0), 0);
  $: difference = team1Total - team2Total;

  const searchResults = (query, side) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const mine = side === 1 ? team1 : team2;
    if (mine.length >= MAX_PER_SIDE) return [];
    return [...new Set(data
      .filter(item => item.Year === selectedYear)
      .map(item => item.Name)
      .filter(name => name.toLowerCase().includes(q) && !placedNorm.has(normalizeName(name)))
      .sort())].slice(0, 8);
  };
  $: results1 = searchResults(query1, 1);
  $: results2 = searchResults(query2, 2);

  const syncUrl = () => {
    setParams({
      t1: team1.length ? team1.join(',') : null,
      t2: team2.length ? team2.join(',') : null,
      year: selectedYear && years.length && selectedYear !== years[0] ? selectedYear : null
    });
  };

  function addPlayer(side, name) {
    if (!name || placedNorm.has(normalizeName(name))) return;
    if (side === 1) {
      if (team1.length >= MAX_PER_SIDE) return;
      team1 = [...team1, name];
      query1 = '';
    } else {
      if (team2.length >= MAX_PER_SIDE) return;
      team2 = [...team2, name];
      query2 = '';
    }
    syncUrl();
  }

  function removePlayer(side, name) {
    if (side === 1) team1 = team1.filter(n => n !== name);
    else team2 = team2.filter(n => n !== name);
    syncUrl();
  }

  function clearSide(side) {
    if (side === 1) team1 = [];
    else team2 = [];
    syncUrl();
  }

  const loadData = async () => {
    loading = true;
    loadError = '';
    try {
      const response = await fetch(filePath);
      if (!response.ok) throw new Error(`Player values could not be loaded (${response.status}).`);
      const result = Papa.parse(await response.text(), { header: true, skipEmptyLines: true });
      if (result.errors.length) throw new Error('Player values file could not be parsed.');
      const invalidRows = result.data.filter((row) =>
        !row.Year || !row.Name || !Number.isFinite(Number(row.Value)) || Number(row.Value) < 0
      );
      if (invalidRows.length) throw new Error('Player values file contains invalid or negative values.');
      data = result.data.map((row) => ({ ...row, Value: Number(row.Value) }));
      years = [...new Set(data.map(row => row.Year))]
        .filter(Boolean)
        .sort((a, b) => Number(b) - Number(a));
      selectedYear = years[0] || "";
      if (!selectedYear) throw new Error('No player value seasons are available.');
      const urlYear = initParams.get('year');
      if (urlYear && years.includes(urlYear)) selectedYear = urlYear;
      applyUrlSelections();
    } catch (error) {
      data = [];
      years = [];
      selectedYear = '';
      loadError = error.message;
    } finally {
      loading = false;
    }
  };

  function applyUrlSelections() {
    const parse = (raw) => (raw || '').split(',').map(s => s.trim()).filter(Boolean);
    const seen = new Set();
    const take = (names) => names.filter(n => {
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    }).slice(0, MAX_PER_SIDE);
    team1 = take(parse(initParams.get('t1')));
    team2 = take(parse(initParams.get('t2')));
  }

  const loadRosters = async () => {
    rostersLoading = true;
    try {
      const [rosterResponse, playersResult, managerMapResponse] = await Promise.all([
        fetchWithRetry(`https://api.sleeper.app/v1/league/${leagueID}/rosters`),
        loadPlayers(null),
        fetchWithRetry('/Manager_map.txt')
      ]);
      const rosters = await rosterResponse.json();
      const players = playersResult.players;
      const managerMappings = Papa.parse(await managerMapResponse.text(), { header: true }).data;
      const managerMap = new Map(managerMappings.map(entry => [String(entry.Index), entry.Name]));
      managerRosters = rosters
        .map(roster => ({
          manager: managerMap.get(String(roster.roster_id)) || `Team ${roster.roster_id}`,
          players: [...new Set((roster.players || [])
            .map(id => players[id] ? `${players[id].first_name} ${players[id].last_name}` : '')
            .filter(Boolean))].sort()
        }))
        .sort((a, b) => a.manager.localeCompare(b.manager));
    } catch (error) {
      managerRosters = [];
    } finally {
      rostersLoading = false;
    }
  };

  onMount(() => {
    loadData();
    loadRosters();
  });
</script>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .explainer {
    margin: 0;
    opacity: 0.85;
  }

  .calculator-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }

  .calculator-controls select,
  .roster-pick {
    padding: 7px 10px;
    border: 1px solid var(--ddd);
    border-radius: 6px;
    background: var(--fff);
    color: inherit;
    font: inherit;
  }

  .team-container {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    width: 100%;
    box-sizing: border-box;
    align-items: flex-start;
  }

  .team {
    width: 48%;
    box-sizing: border-box;
  }

  .team-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .team h2 {
    margin-top: 0;
  }

  .clear-btn {
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    opacity: 0.7;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .add-box {
    position: relative;
    margin-bottom: 12px;
  }

  .add-box input {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 12px;
    border: 1px solid var(--ddd);
    border-radius: 6px;
    background: var(--fff);
    color: inherit;
    font: inherit;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 240px;
    overflow-y: auto;
    background: var(--fff);
    border: 1px solid var(--ddd);
    border-radius: 6px;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  }

  .dropdown-item {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 12px;
    cursor: pointer;
  }

  .dropdown-item:hover {
    background: var(--headerPrimary);
  }

  .dropdown-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .player-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 2px;
    border-bottom: 1px solid var(--ddd);
  }

  .player-name {
    flex: 1 1 auto;
    min-width: 0;
  }

  .player-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .no-value {
    font-weight: 400;
    font-size: 13px;
    opacity: 0.65;
  }

  .remove-btn {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border: 1px solid var(--ddd);
    border-radius: 50%;
    background: var(--fff);
    color: inherit;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .empty-note {
    margin: 6px 0 12px;
    font-size: 14px;
    opacity: 0.65;
  }

  .roster-add {
    margin-top: 14px;
    border-top: 1px dashed var(--ddd);
    padding-top: 12px;
  }

  .roster-add label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .roster-pick {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 10px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .p-chip {
    padding: 5px 10px;
    border: 1px solid var(--ddd);
    border-radius: 999px;
    background: var(--fff);
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .p-chip:disabled {
    opacity: 0.4;
    cursor: default;
    text-decoration: line-through;
  }

  .team-summary {
    margin-top: 16px;
    font-weight: bold;
  }

  .team-summary p {
    margin: 0;
  }

  .verdict {
    position: sticky;
    bottom: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 1.05rem;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  }

  .verdict-hint {
    opacity: 0.75;
    font-size: 0.95rem;
  }

  @media (max-width: 768px) {
    .team-container {
      flex-direction: column;
    }

    .team {
      width: 100%;
    }
  }
</style>

<div class="container">
  <div>
    <h1>Cap Trade Calculator</h1>
    <p class="explainer">Build both sides of a trade and compare total cap value. Search, or add straight from a roster — the link in the address bar captures the comparison, so you can paste it in the group chat.</p>
  </div>
  {#if loading}
    <p>Loading player values…</p>
  {:else if loadError}
    <div class="load-error" role="alert">
      {loadError} <button on:click={loadData}>Retry</button>
    </div>
  {/if}
  <div class="calculator-controls">
    <label for="value-year">Value year</label>
    <select id="value-year" bind:value={selectedYear} on:change={syncUrl} disabled={years.length === 0}>
      {#each years as year}
        <option value={year}>{year}{year === years[0] ? ' (current)' : ''}</option>
      {/each}
    </select>
  </div>

  {#if !loadError && !loading}
  <div class="team-container">
    <!-- Team 1 -->
    <div class="team league-card">
      <div class="team-head">
        <h2>Team 1</h2>
        {#if team1.length}<button class="clear-btn" on:click={() => clearSide(1)}>Clear</button>{/if}
      </div>
      <div class="add-box">
        <input
          type="text"
          placeholder={team1.length >= MAX_PER_SIDE ? `Side is full (${MAX_PER_SIDE})` : 'Add a player…'}
          bind:value={query1}
          disabled={team1.length >= MAX_PER_SIDE}
        />
        {#if results1.length > 0}
          <div class="dropdown">
            {#each results1 as name}
              <div class="dropdown-item" on:click={() => addPlayer(1, name)}>
                <span>{name}</span>
                <span class="dropdown-value">${valueOf(name)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {#if team1.length === 0}
        <p class="empty-note">No players yet.</p>
      {/if}
      {#each team1Resolved as p (p.name)}
        <div class="player-row">
          <span class="player-name">{p.name}</span>
          {#if p.value != null}
            <span class="player-value">${p.value}</span>
          {:else}
            <span class="no-value">no {selectedYear} value</span>
          {/if}
          <button class="remove-btn" aria-label={`Remove ${p.name}`} on:click={() => removePlayer(1, p.name)}>×</button>
        </div>
      {/each}
      <div class="roster-add">
        <label for="roster-pick-1">Add from a roster</label>
        {#if rostersLoading}
          <p class="empty-note">Loading rosters…</p>
        {:else if managerRosters.length === 0}
          <p class="empty-note">Rosters couldn't load — search still works.</p>
        {:else}
          <select id="roster-pick-1" class="roster-pick" bind:value={rosterPick1}>
            <option value="">Choose a manager…</option>
            {#each managerRosters as r}
              <option value={r.manager}>{r.manager}</option>
            {/each}
          </select>
          {#if rosterPick1}
            <div class="chips">
              {#each (managerRosters.find(r => r.manager === rosterPick1)?.players || []) as name}
                <button class="p-chip" disabled={placedNorm.has(normalizeName(name)) || team1.length >= MAX_PER_SIDE} on:click={() => addPlayer(1, name)}>{name}</button>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
      <div class="team-summary">
        <p>Total Value: ${team1Total}</p>
      </div>
    </div>

    <!-- Team 2 -->
    <div class="team league-card">
      <div class="team-head">
        <h2>Team 2</h2>
        {#if team2.length}<button class="clear-btn" on:click={() => clearSide(2)}>Clear</button>{/if}
      </div>
      <div class="add-box">
        <input
          type="text"
          placeholder={team2.length >= MAX_PER_SIDE ? `Side is full (${MAX_PER_SIDE})` : 'Add a player…'}
          bind:value={query2}
          disabled={team2.length >= MAX_PER_SIDE}
        />
        {#if results2.length > 0}
          <div class="dropdown">
            {#each results2 as name}
              <div class="dropdown-item" on:click={() => addPlayer(2, name)}>
                <span>{name}</span>
                <span class="dropdown-value">${valueOf(name)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {#if team2.length === 0}
        <p class="empty-note">No players yet.</p>
      {/if}
      {#each team2Resolved as p (p.name)}
        <div class="player-row">
          <span class="player-name">{p.name}</span>
          {#if p.value != null}
            <span class="player-value">${p.value}</span>
          {:else}
            <span class="no-value">no {selectedYear} value</span>
          {/if}
          <button class="remove-btn" aria-label={`Remove ${p.name}`} on:click={() => removePlayer(2, p.name)}>×</button>
        </div>
      {/each}
      <div class="roster-add">
        <label for="roster-pick-2">Add from a roster</label>
        {#if rostersLoading}
          <p class="empty-note">Loading rosters…</p>
        {:else if managerRosters.length === 0}
          <p class="empty-note">Rosters couldn't load — search still works.</p>
        {:else}
          <select id="roster-pick-2" class="roster-pick" bind:value={rosterPick2}>
            <option value="">Choose a manager…</option>
            {#each managerRosters as r}
              <option value={r.manager}>{r.manager}</option>
            {/each}
          </select>
          {#if rosterPick2}
            <div class="chips">
              {#each (managerRosters.find(r => r.manager === rosterPick2)?.players || []) as name}
                <button class="p-chip" disabled={placedNorm.has(normalizeName(name)) || team2.length >= MAX_PER_SIDE} on:click={() => addPlayer(2, name)}>{name}</button>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
      <div class="team-summary">
        <p>Total Value: ${team2Total}</p>
      </div>
    </div>
  </div>

  <div class="verdict league-card">
    {#if team1.length === 0 && team2.length === 0}
      <span class="verdict-hint">Add players on both sides to compare total cap value.</span>
    {:else}
      <span>Team 1 <strong>${team1Total}</strong></span>
      <span>·</span>
      <span>Team 2 <strong>${team2Total}</strong></span>
      <span>·</span>
      {#if difference === 0}
        <span>Dead even</span>
      {:else}
        <span>Team {difference > 0 ? 1 : 2} is heavier by <strong>${Math.abs(difference)}</strong></span>
      {/if}
    {/if}
  </div>
  {/if}
</div>
