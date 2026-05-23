<script>
  import { onMount } from 'svelte';
  import Papa from 'papaparse';
  import { Chart, registerables } from 'chart.js';
  import { leagueID } from '$lib/utils/leagueInfo';
  import {
    buildRookieContracts,
    buildValueIndexes,
    parseFantasyProsMarketCsv,
    resolvePlayerValue,
    getContractBreakdown
  } from '$lib/utils/playerNameLookup';
  import { buildCapAnalysisData } from '$lib/utils/helperFunctions/capAnalysis';

  Chart.register(...registerables);

  const VALUE_YEAR = '2026';
  const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'Other'];
  const POS_COLORS = {
    QB: '#e74c3c',
    RB: '#2ecc71',
    WR: '#3498db',
    TE: '#f39c12',
    Other: '#95a5a6'
  };

  // ── State ──────────────────────────────────────────────────────────────────
  let loading = true;
  let error = null;
  let activeSection = 'allocation';
  let pointsMode = 'starter'; // 'starter' | 'roster'
  let trendView = 'season';   // 'season' | 'weekly'
  let selectedCapYear = Number(VALUE_YEAR);
  let playerSortKey = 'dollarPerStarterPt';
  let playerSortDir = 1;      // 1 = asc, -1 = desc
  let teamSortKey = 'dollarPerStarterPt';
  let teamSortDir = 1;
  let playerFilterPos = 'All';
  let playerFilterTeam = 'All';
  let playerSearch = '';

  // ── Data ───────────────────────────────────────────────────────────────────
  let data = null;
  let allManagers = [];
  let availableYears = [];

  // ── Charts ─────────────────────────────────────────────────────────────────
  let allocationChart = null;
  let allocationPctChart = null;
  let trendChart = null;

  // ── Derived ────────────────────────────────────────────────────────────────
  $: efficiencyKey = pointsMode === 'starter' ? 'dollarPerStarterPt' : 'dollarPerRosterPt';
  $: ptsKey = pointsMode === 'starter' ? 'starterPts' : 'rosterPts';

  $: sortedTeams = data
    ? [...data.teamEfficiency].sort((a, b) => {
        const av = a[teamSortKey] ?? Infinity;
        const bv = b[teamSortKey] ?? Infinity;
        return teamSortDir * (av - bv);
      })
    : [];

  $: filteredPlayers = data
    ? data.playerEfficiency.filter((p) => {
        const posMatch = playerFilterPos === 'All' || p.position === playerFilterPos;
        const teamMatch = playerFilterTeam === 'All' || p.manager === playerFilterTeam;
        const searchMatch = !playerSearch || p.name.toLowerCase().includes(playerSearch.toLowerCase());
        return posMatch && teamMatch && searchMatch;
      })
    : [];

  $: sortedPlayers = [...filteredPlayers].sort((a, b) => {
    const av = a[playerSortKey] ?? Infinity;
    const bv = b[playerSortKey] ?? Infinity;
    return playerSortDir * (av - bv);
  });

  function setPlayerSort(key) {
    if (playerSortKey === key) {
      playerSortDir *= -1;
    } else {
      playerSortKey = key;
      playerSortDir = key === 'name' || key === 'position' || key === 'manager' ? 1 : 1;
    }
  }

  function setTeamSort(key) {
    if (teamSortKey === key) {
      teamSortDir *= -1;
    } else {
      teamSortKey = key;
      teamSortDir = 1;
    }
  }

  function sortArrow(key, currentKey, dir) {
    if (key !== currentKey) return '';
    return dir === 1 ? ' ▲' : ' ▼';
  }

  // ── Chart builders ─────────────────────────────────────────────────────────
  function destroyCharts() {
    [allocationChart, allocationPctChart, trendChart].forEach((c) => c?.destroy());
    allocationChart = null;
    allocationPctChart = null;
    trendChart = null;
  }

  function buildAllocationCharts() {
    if (!data) return;
    const yearData = data.capByPosition[selectedCapYear] || {};
    const managers = Object.keys(yearData).sort();

    // Absolute stacked bar
    const absCtx = document.getElementById('alloc-abs-chart');
    if (absCtx) {
      allocationChart?.destroy();
      allocationChart = new Chart(absCtx.getContext('2d'), {
        type: 'bar',
        data: {
          labels: managers,
          datasets: POSITIONS.map((pos) => ({
            label: pos,
            data: managers.map((m) => yearData[m]?.[pos] || 0),
            backgroundColor: POS_COLORS[pos]
          }))
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'top' }, title: { display: true, text: 'Cap $ by Position' } },
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
        }
      });
    }

    // % of cap stacked bar + league avg lines
    const pctCtx = document.getElementById('alloc-pct-chart');
    if (pctCtx) {
      allocationPctChart?.destroy();
      const leagueAvg = data.leagueAvgByPosition[selectedCapYear] || {};
      const pctDatasets = POSITIONS.map((pos) => ({
        label: pos,
        data: managers.map((m) => {
          const tc = yearData[m];
          if (!tc || !tc.total) return 0;
          return Math.round((tc[pos] / tc.total) * 1000) / 10;
        }),
        backgroundColor: POS_COLORS[pos],
        stack: 'pct'
      }));

      allocationPctChart = new Chart(pctCtx.getContext('2d'), {
        type: 'bar',
        data: { labels: managers, datasets: pctDatasets },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'top' },
            title: { display: true, text: '% of Cap by Position (league avg shown in tooltip)' },
            tooltip: {
              callbacks: {
                footer: (items) => {
                  const pos = items[0]?.dataset?.label;
                  if (!pos) return '';
                  const avg = leagueAvg[pos];
                  return avg != null ? `League avg: ${avg.toFixed(1)}%` : '';
                }
              }
            }
          },
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } }
          }
        }
      });
    }
  }

  function buildTrendChart() {
    if (!data) return;
    const ctx = document.getElementById('trend-chart');
    if (!ctx) return;
    trendChart?.destroy();

    const ptKey = pointsMode === 'starter' ? 'dollarPerStarterPt' : 'dollarPerRosterPt';
    const managers = allManagers;
    const CHART_COLORS = [
      '#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6',
      '#1abc9c','#e67e22','#34495e','#e91e63','#00bcd4',
      '#8bc34a','#ff5722','#607d8b','#795548','#ffc107','#673ab7'
    ];

    if (trendView === 'season') {
      const years = [...new Set(data.seasonTrends.map((t) => t.year))].sort((a, b) => a - b);

      trendChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
          labels: years,
          datasets: managers.map((mgr, i) => {
            const mgrTrends = data.seasonTrends.filter((t) => t.manager === mgr);
            return {
              label: mgr,
              data: years.map((y) => {
                const entry = mgrTrends.find((t) => t.year === y);
                return entry?.[ptKey] ?? null;
              }),
              borderColor: CHART_COLORS[i % CHART_COLORS.length],
              backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '33',
              tension: 0.3,
              spanGaps: true
            };
          })
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'right' },
            title: { display: true, text: '$/Fantasy Point by Season' },
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y?.toFixed(2)}/pt` } }
          },
          scales: {
            y: {
              beginAtZero: false,
              title: { display: true, text: '$ per Fantasy Point' }
            },
            x: { title: { display: true, text: 'Season' } }
          }
        }
      });
    } else {
      const allWeeks = [...new Set(
        Object.values(data.weeklyTrends).flatMap((wArr) => wArr.map((w) => w.week))
      )].sort((a, b) => a - b);

      trendChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
          labels: allWeeks.map((w) => `Wk ${w}`),
          datasets: managers.map((mgr, i) => {
            const wArr = data.weeklyTrends[mgr] || [];
            return {
              label: mgr,
              data: allWeeks.map((w) => {
                const entry = wArr.find((e) => e.week === w);
                return entry?.[ptKey] ?? null;
              }),
              borderColor: CHART_COLORS[i % CHART_COLORS.length],
              backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '33',
              tension: 0.3,
              spanGaps: true
            };
          })
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'right' },
            title: { display: true, text: 'Rolling $/Fantasy Point (cumulative, current season)' },
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y?.toFixed(2)}/pt` } }
          },
          scales: {
            y: {
              beginAtZero: false,
              title: { display: true, text: '$ per Fantasy Point (cumulative)' }
            },
            x: { title: { display: true, text: 'Week' } }
          }
        }
      });
    }
  }

  // Reactive chart rebuilds when controls change
  $: if (data && activeSection === 'allocation') {
    setTimeout(buildAllocationCharts, 0);
  }
  $: if (data && activeSection === 'trends') {
    setTimeout(buildTrendChart, 0);
  }
  $: if (data && activeSection === 'trends' && (trendView || pointsMode)) {
    setTimeout(buildTrendChart, 0);
  }
  $: if (data && activeSection === 'allocation' && selectedCapYear) {
    setTimeout(buildAllocationCharts, 0);
  }

  // ── Load ───────────────────────────────────────────────────────────────────
  onMount(async () => {
    try {
      // Fetch static data files
      const [playerMapRes, managerMapRes, playerValuesRes, nflPlayersRes] = await Promise.all([
        fetch('/fp_sleeper_mapping.txt'),
        fetch('/Manager_map.txt'),
        fetch('/Player_Values.txt'),
        fetch('https://api.sleeper.app/v1/players/nfl')
      ]);

      const [playerMapText, managerMapText, playerValuesText, nflPlayers] = await Promise.all([
        playerMapRes.text(),
        managerMapRes.text(),
        playerValuesRes.text(),
        nflPlayersRes.json()
      ]);

      const playerMappings = Papa.parse(playerMapText, { header: true }).data;
      const sleeperToFantasyPros = new Map(
        playerMappings
          .filter((e) => e.Sleeper && e.Fantasy_Pros)
          .map((e) => [e.Sleeper, e.Fantasy_Pros])
      );

      const managerMappings = Papa.parse(managerMapText, { header: true }).data;
      const managerMapRaw = new Map(managerMappings.map((e) => [e.Index, e.Name]));

      const playerValues = Papa.parse(playerValuesText, { header: true, skipEmptyLines: true }).data;
      const historyRows = playerValues
        .filter((e) => e.Year && e.Name)
        .map((e) => ({
          Year: Number(e.Year),
          Name: String(e.Name).trim(),
          Value: parseFloat(e.Value) || 0,
          Rookie: Number(e.Rookie) === 1 ? 1 : 0
        }));

      const yearRows = historyRows.filter((e) => String(e.Year) === VALUE_YEAR);
      const valueIndexes = { ...buildValueIndexes(yearRows), sleeperToFantasyPros };
      const rookieContracts = buildRookieContracts(historyRows);

      let marketValueByName = new Map();
      try {
        const mktRes = await fetch(`/fantasypros-${VALUE_YEAR}.csv`);
        if (mktRes.ok) marketValueByName = parseFantasyProsMarketCsv(await mktRes.text());
      } catch (e) {
        console.warn('FantasyPros market file not loaded:', e);
      }

      data = await buildCapAnalysisData({
        historyRows,
        marketValueByName,
        rookieContracts,
        valueIndexes,
        players: nflPlayers,
        managerMapRaw,
        valueYear: VALUE_YEAR
      });

      allManagers = [...new Set([
        ...data.teamEfficiency.map((t) => t.manager),
        ...Object.keys(data.weeklyTrends)
      ])].sort();

      availableYears = data.years.slice().reverse();
      selectedCapYear = Number(VALUE_YEAR);

      loading = false;

      // Draw initial charts after DOM updates
      await new Promise((r) => setTimeout(r, 50));
      buildAllocationCharts();
    } catch (err) {
      console.error(err);
      error = err.message || 'Failed to load cap analysis data.';
      loading = false;
    }
  });
</script>

<style>
  .page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem 1.25rem 3rem;
    font-family: inherit;
  }

  h2 { margin-bottom: 0.25rem; }
  .subtitle { color: #666; margin-top: 0; margin-bottom: 1.5rem; font-size: 14px; }

  /* Section tabs */
  .section-tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid #ddd;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .tab-btn {
    padding: 0.6rem 1.25rem;
    border: none;
    background: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    color: #666;
    border-bottom: 3px solid transparent;
    margin-bottom: -2px;
    transition: color 0.15s, border-color 0.15s;
  }
  .tab-btn.active {
    color: var(--accent, #1a73e8);
    border-bottom-color: var(--accent, #1a73e8);
  }
  .tab-btn:hover:not(.active) { color: #333; }

  /* Controls bar */
  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }
  .controls label { font-size: 13px; color: #555; }
  .controls select, .controls input[type="text"] {
    padding: 4px 8px;
    font-size: 13px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .toggle-group {
    display: flex;
    border: 1px solid #ccc;
    border-radius: 4px;
    overflow: hidden;
  }
  .toggle-btn {
    padding: 4px 14px;
    font-size: 13px;
    border: none;
    background: #f5f5f5;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .toggle-btn.active {
    background: var(--accent, #1a73e8);
    color: #fff;
  }

  /* Charts */
  .charts-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 2rem;
  }
  .chart-box {
    background: var(--surface, #fff);
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1rem;
  }
  .chart-box canvas { max-height: 340px; }

  .chart-full {
    background: var(--surface, #fff);
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 2rem;
  }
  .chart-full canvas { max-height: 400px; }

  /* Tables */
  .table-section { margin-bottom: 2rem; }
  .table-section h3 { margin-bottom: 0.5rem; font-size: 16px; }

  .table-wrap {
    overflow-x: auto;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  thead th {
    background: #1a1a1a;
    color: #fff;
    padding: 8px 10px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    position: sticky;
    top: 0;
  }
  thead th:hover { background: #333; }

  tbody tr:nth-child(even) { background: var(--oddRowBackground, #f9f9f9); }
  tbody tr:hover { background: var(--tableHover, #eef4ff); }

  td {
    padding: 7px 10px;
    border-bottom: 1px solid #eee;
    white-space: nowrap;
  }

  .pos-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
  }
  .pos-QB { background: #e74c3c; }
  .pos-RB { background: #2ecc71; }
  .pos-WR { background: #3498db; }
  .pos-TE { background: #f39c12; }
  .pos-Other { background: #95a5a6; }

  .eff-good { color: #27ae60; font-weight: 700; }
  .eff-mid  { color: #e67e22; font-weight: 700; }
  .eff-bad  { color: #e74c3c; font-weight: 700; }

  .null-val { color: #aaa; font-style: italic; }

  /* Loading / error */
  .loading, .error-msg {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 30vh;
    font-size: 15px;
    color: #666;
  }
  .error-msg { color: #c0392b; }

  @media (max-width: 768px) {
    .charts-row { grid-template-columns: 1fr; }
    .controls { gap: 0.5rem; }
    table { font-size: 11px; }
    td, thead th { padding: 5px 6px; }
  }
</style>

<div class="page">
  <h2>Cap Analysis</h2>
  <p class="subtitle">Spending allocation, efficiency, and historical trends across the league</p>

  <!-- Section Tabs -->
  <div class="section-tabs">
    <button class="tab-btn" class:active={activeSection === 'allocation'}
      on:click={() => (activeSection = 'allocation')}>
      Cap Allocation
    </button>
    <button class="tab-btn" class:active={activeSection === 'efficiency'}
      on:click={() => (activeSection = 'efficiency')}>
      Efficiency ($/pt)
    </button>
    <button class="tab-btn" class:active={activeSection === 'trends'}
      on:click={() => (activeSection = 'trends')}>
      Historical Trends
    </button>
  </div>

  {#if loading}
    <div class="loading">Loading cap analysis data… this may take a moment.</div>
  {:else if error}
    <div class="error-msg">Error: {error}</div>
  {:else if data}

    <!-- ── SECTION 1: Cap Allocation ───────────────────────────────────── -->
    {#if activeSection === 'allocation'}
      <div class="controls">
        <label>Year:
          <select bind:value={selectedCapYear}>
            {#each availableYears as y}
              <option value={y}>{y}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="charts-row">
        <div class="chart-box">
          <canvas id="alloc-abs-chart"></canvas>
        </div>
        <div class="chart-box">
          <canvas id="alloc-pct-chart"></canvas>
        </div>
      </div>

      <!-- Allocation table -->
      <div class="table-section">
        <h3>Cap Breakdown by Position — {selectedCapYear}</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Manager</th>
                {#each POSITIONS as pos}<th>{pos}</th>{/each}
                <th>Total</th>
                {#each POSITIONS as pos}<th>% {pos}</th>{/each}
              </tr>
            </thead>
            <tbody>
              {#each Object.entries(data.capByPosition[selectedCapYear] || {}).sort((a,b) => b[1].total - a[1].total) as [mgr, caps]}
                <tr>
                  <td>{mgr}</td>
                  {#each POSITIONS as pos}
                    <td>${caps[pos] || 0}</td>
                  {/each}
                  <td><strong>${caps.total || 0}</strong></td>
                  {#each POSITIONS as pos}
                    <td>{caps.total ? ((caps[pos] / caps.total) * 100).toFixed(1) : '0.0'}%</td>
                  {/each}
                </tr>
              {/each}
              <!-- League average row -->
              {#if data.leagueAvgByPosition[selectedCapYear]}
                {@const avg = data.leagueAvgByPosition[selectedCapYear]}
                <tr style="background: var(--r2, #fff3cd); font-style: italic;">
                  <td><strong>League Avg</strong></td>
                  {#each POSITIONS as pos}
                    <td>—</td>
                  {/each}
                  <td>—</td>
                  {#each POSITIONS as pos}
                    <td>{avg[pos]?.toFixed(1)}%</td>
                  {/each}
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- ── SECTION 2: Efficiency ───────────────────────────────────────── -->
    {#if activeSection === 'efficiency'}
      <div class="controls">
        <span style="font-size:13px; color:#555; font-weight:600;">Points:</span>
        <div class="toggle-group">
          <button class="toggle-btn" class:active={pointsMode === 'starter'}
            on:click={() => (pointsMode = 'starter')}>Starter</button>
          <button class="toggle-btn" class:active={pointsMode === 'roster'}
            on:click={() => (pointsMode = 'roster')}>All Roster</button>
        </div>
      </div>

      <!-- Team-level table -->
      <div class="table-section">
        <h3>Team Efficiency — {VALUE_YEAR}</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th on:click={() => setTeamSort('manager')}>Manager{sortArrow('manager', teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort('capHit')}>Cap Hit{sortArrow('capHit', teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort(ptsKey)}>{pointsMode === 'starter' ? 'Starter' : 'Roster'} Pts{sortArrow(ptsKey, teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort(efficiencyKey)}>$/pt{sortArrow(efficiencyKey, teamSortKey, teamSortDir)}</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedTeams as team}
                {@const effVal = team[efficiencyKey]}
                {@const pts = team[ptsKey]}
                <tr>
                  <td>{team.manager}</td>
                  <td>${team.capHit}</td>
                  <td>{pts > 0 ? pts.toFixed(1) : '—'}</td>
                  <td>
                    {#if effVal != null}
                      <span class={effVal < 1.5 ? 'eff-good' : effVal < 3 ? 'eff-mid' : 'eff-bad'}>
                        ${effVal.toFixed(2)}
                      </span>
                    {:else}
                      <span class="null-val">no pts yet</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Player-level table -->
      <div class="table-section">
        <h3>Player Efficiency — {VALUE_YEAR}</h3>
        <div class="controls" style="margin-bottom: 0.75rem;">
          <label>Position:
            <select bind:value={playerFilterPos}>
              <option>All</option>
              {#each ['QB','RB','WR','TE','Other'] as p}<option>{p}</option>{/each}
            </select>
          </label>
          <label>Team:
            <select bind:value={playerFilterTeam}>
              <option>All</option>
              {#each allManagers as m}<option>{m}</option>{/each}
            </select>
          </label>
          <label>Search:
            <input type="text" placeholder="Player name…" bind:value={playerSearch} />
          </label>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th on:click={() => setPlayerSort('name')}>Player{sortArrow('name', playerSortKey, playerSortDir)}</th>
                <th on:click={() => setPlayerSort('position')}>Pos{sortArrow('position', playerSortKey, playerSortDir)}</th>
                <th on:click={() => setPlayerSort('manager')}>Manager{sortArrow('manager', playerSortKey, playerSortDir)}</th>
                <th on:click={() => setPlayerSort('capHit')}>Cap Hit{sortArrow('capHit', playerSortKey, playerSortDir)}</th>
                <th on:click={() => setPlayerSort(ptsKey)}>{pointsMode === 'starter' ? 'Starter' : 'Roster'} Pts{sortArrow(ptsKey, playerSortKey, playerSortDir)}</th>
                <th on:click={() => setPlayerSort(efficiencyKey)}>$/pt{sortArrow(efficiencyKey, playerSortKey, playerSortDir)}</th>
                <th>Contract</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedPlayers as p}
                {@const effVal = p[efficiencyKey]}
                {@const pts = p[ptsKey]}
                <tr>
                  <td>{p.name}</td>
                  <td><span class="pos-badge pos-{p.position}">{p.position}</span></td>
                  <td>{p.manager}</td>
                  <td>${p.capHit}</td>
                  <td>{pts > 0 ? pts.toFixed(1) : '—'}</td>
                  <td>
                    {#if effVal != null}
                      <span class={effVal < 1.5 ? 'eff-good' : effVal < 3 ? 'eff-mid' : 'eff-bad'}>
                        ${effVal.toFixed(2)}
                      </span>
                    {:else}
                      <span class="null-val">no pts</span>
                    {/if}
                  </td>
                  <td style="font-size:11px; color:#777;">{p.contractLabel || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- ── SECTION 3: Historical Trends ───────────────────────────────── -->
    {#if activeSection === 'trends'}
      <div class="controls">
        <span style="font-size:13px; color:#555; font-weight:600;">View:</span>
        <div class="toggle-group">
          <button class="toggle-btn" class:active={trendView === 'season'}
            on:click={() => { trendView = 'season'; setTimeout(buildTrendChart, 0); }}>
            Season History
          </button>
          <button class="toggle-btn" class:active={trendView === 'weekly'}
            on:click={() => { trendView = 'weekly'; setTimeout(buildTrendChart, 0); }}>
            Weekly (Current Season)
          </button>
        </div>
        <span style="font-size:13px; color:#555; font-weight:600;">Points:</span>
        <div class="toggle-group">
          <button class="toggle-btn" class:active={pointsMode === 'starter'}
            on:click={() => { pointsMode = 'starter'; setTimeout(buildTrendChart, 0); }}>
            Starter
          </button>
          <button class="toggle-btn" class:active={pointsMode === 'roster'}
            on:click={() => { pointsMode = 'roster'; setTimeout(buildTrendChart, 0); }}>
            All Roster
          </button>
        </div>
      </div>

      <div class="chart-full">
        <canvas id="trend-chart"></canvas>
      </div>

      <!-- Season trends table -->
      {#if trendView === 'season'}
        <div class="table-section">
          <h3>Season-by-Season Efficiency</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Manager</th>
                  <th>Cap Hit</th>
                  <th>{pointsMode === 'starter' ? 'Starter' : 'Roster'} Pts</th>
                  <th>$/pt</th>
                </tr>
              </thead>
              <tbody>
                {#each [...data.seasonTrends].sort((a,b) => b.year - a.year || a[efficiencyKey] - b[efficiencyKey]) as row}
                  {@const effVal = row[efficiencyKey]}
                  {@const pts = row[ptsKey]}
                  <tr>
                    <td>{row.year}</td>
                    <td>{row.manager}</td>
                    <td>${row.capHit}</td>
                    <td>{pts > 0 ? pts.toFixed(1) : '—'}</td>
                    <td>
                      {#if effVal != null}
                        <span class={effVal < 1.5 ? 'eff-good' : effVal < 3 ? 'eff-mid' : 'eff-bad'}>
                          ${effVal.toFixed(2)}
                        </span>
                      {:else}
                        <span class="null-val">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/if}

  {/if}
</div>
