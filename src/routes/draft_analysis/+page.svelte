<script>
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import { buildDraftAnalysisData } from '$lib/utils/helperFunctions/draftAnalysis';

  Chart.register(...registerables);

  const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'Other'];
  const POS_COLORS = { QB: '#e74c3c', RB: '#2ecc71', WR: '#3498db', TE: '#f39c12', Other: '#95a5a6' };
  const CHART_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a','#ff5722','#607d8b','#795548','#ffc107','#673ab7','#34495e'];

  let loading = true;
  let error = null;
  let activeSection = 'team';
  let pointsMode = 'starter';
  let data = null;

  let teamSortKey = 'totalStarterPts';
  let teamSortDir = -1;
  let posSortKey = 'starterPts';
  let posSortDir = -1;
  let selectedPosManager = 'All';
  let selectedDraftYear = 'All';
  let logSearch = '';

  let barChart = null;
  let posChart = null;
  let trendChart = null;

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function chartTheme() { return { textColor: cssVar('--g333') || '#333', gridColor: cssVar('--ddd') || '#ddd' }; }

  $: ptsKey = pointsMode === 'starter' ? 'starterPts' : 'rosterPts';
  $: totalPtsKey = pointsMode === 'starter' ? 'totalStarterPts' : 'totalRosterPts';
  $: avgPtsKey = pointsMode === 'starter' ? 'avgStarterPtsPerPick' : 'avgRosterPtsPerPick';

  $: sortedTeams = data
    ? [...data.teamSummary].sort((a, b) => {
        const av = a[teamSortKey] ?? -Infinity, bv = b[teamSortKey] ?? -Infinity;
        if (typeof av === 'string') return teamSortDir * av.localeCompare(bv);
        return teamSortDir * (av - bv);
      })
    : [];

  $: filteredDrafts = data
    ? (selectedDraftYear === 'All' ? data.drafts : data.drafts.filter(d => d.year === Number(selectedDraftYear)))
    : [];

  $: filteredPicks = filteredDrafts.flatMap(d => d.picks.map(p => ({ ...p, year: d.year }))).filter(p => {
    const srch = !logSearch || p.playerName.toLowerCase().includes(logSearch.toLowerCase()) || p.manager.toLowerCase().includes(logSearch.toLowerCase());
    const mgr = selectedPosManager === 'All' || p.manager === selectedPosManager;
    return srch && mgr;
  });

  let posMgrSortKey = 'total';
  let posMgrSortDir = -1;
  function setPosMgrSort(key) {
    if (posMgrSortKey === key) posMgrSortDir *= -1;
    else { posMgrSortKey = key; posMgrSortDir = -1; }
  }

  $: posMgrRows = (() => {
    if (!data) return [];
    return data.teamSummary.map(t => {
      const row = { manager: t.manager };
      let total = 0;
      for (const pos of POSITIONS) {
        const v = t.posBreakdown?.[pos]?.[ptsKey] || 0;
        row[pos] = Math.round(v * 10) / 10;
        total += v;
      }
      row.total = Math.round(total * 10) / 10;
      return row;
    });
  })();

  $: sortedPosMgr = [...posMgrRows].sort((a, b) => {
    if (posMgrSortKey === 'manager') return posMgrSortDir * a.manager.localeCompare(b.manager);
    return posMgrSortDir * ((a[posMgrSortKey] ?? 0) - (b[posMgrSortKey] ?? 0));
  });

  $: posMgrMaxes = (() => {
    const out = {};
    for (const pos of [...POSITIONS, 'total']) {
      out[pos] = Math.max(...(posMgrRows.map(r => r[pos] || 0)), 1);
    }
    return out;
  })();

  function setTeamSort(key) { if (teamSortKey === key) teamSortDir *= -1; else { teamSortKey = key; teamSortDir = -1; } }
  function setPosSort(key) { if (posSortKey === key) posSortDir *= -1; else { posSortKey = key; posSortDir = -1; } }
  function sortArrow(key, cur, dir) { return cur === key ? (dir === 1 ? ' ▲' : ' ▼') : ''; }
  function roundLabel(r) { return ['1st','2nd','3rd','4th','5th','6th','7th','8th'][r - 1] || `${r}th`; }

  function drawBarChart() {
    const el = document.getElementById('draft-bar-chart');
    if (!el || !data) return;
    if (barChart) barChart.destroy();
    const { textColor, gridColor } = chartTheme();
    const sorted = [...data.teamSummary].sort((a, b) => b[totalPtsKey] - a[totalPtsKey]);
    barChart = new Chart(el, {
      type: 'bar',
      data: {
        labels: sorted.map(t => t.manager),
        datasets: [{ label: `Total ${pointsMode === 'starter' ? 'Starter' : 'Roster'} Points from Draft`, data: sorted.map(t => Math.round(t[totalPtsKey])), backgroundColor: CHART_COLORS.map(c => c + '99'), borderColor: CHART_COLORS, borderWidth: 1 }]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: textColor } } }, scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } } }
    });
  }

  function drawPosChart() {
    const el = document.getElementById('draft-pos-chart');
    if (!el || !data) return;
    if (posChart) posChart.destroy();
    const { textColor, gridColor } = chartTheme();
    const source = selectedPosManager === 'All' ? data.teamSummary : data.teamSummary.filter(t => t.manager === selectedPosManager);
    const datasets = POSITIONS.map(pos => ({
      label: pos,
      data: source.map(t => Math.round(t.posBreakdown?.[pos]?.[ptsKey] || 0)),
      backgroundColor: POS_COLORS[pos] + '99',
      borderColor: POS_COLORS[pos],
      borderWidth: 1
    }));
    posChart = new Chart(el, {
      type: 'bar',
      data: { labels: source.map(t => t.manager), datasets },
      options: { responsive: true, plugins: { legend: { labels: { color: textColor } } }, scales: { x: { stacked: true, ticks: { color: textColor }, grid: { color: gridColor } }, y: { stacked: true, ticks: { color: textColor }, grid: { color: gridColor } } } }
    });
  }

  function drawTrendChart() {
    const el = document.getElementById('draft-trend-chart');
    if (!el || !data) return;
    if (trendChart) trendChart.destroy();
    const { textColor, gridColor } = chartTheme();
    const managers = data.managers;
    const years = data.years;
    const datasets = managers.map((mgr, i) => ({
      label: mgr,
      data: years.map(yr => {
        const trend = data.yearTrends.find(t => t.year === yr);
        return trend?.byManager?.[mgr]?.[ptsKey] ? Math.round(trend.byManager[mgr][ptsKey]) : null;
      }),
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '33',
      tension: 0.3,
      spanGaps: true
    }));
    trendChart = new Chart(el, {
      type: 'line',
      data: { labels: years, datasets },
      options: { responsive: true, plugins: { legend: { labels: { color: textColor } } }, scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } } }
    });
  }

  $: if (data && activeSection === 'team') setTimeout(() => { drawBarChart(); drawTrendChart(); }, 50);
  $: if (data && activeSection === 'position') setTimeout(drawPosChart, 50);
  $: if (data && pointsMode) setTimeout(() => { if (activeSection === 'team') { drawBarChart(); drawTrendChart(); } if (activeSection === 'position') drawPosChart(); }, 50);
  $: if (selectedPosManager && data && activeSection === 'position') setTimeout(drawPosChart, 50);

  onMount(async () => {
    try {
      const playersRes = await fetch('https://api.sleeper.app/v1/players/nfl');
      const players = await playersRes.json();
      data = await buildDraftAnalysisData({ players });
    } catch (e) {
      console.error(e);
      error = e.message;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>Draft Analysis</title></svelte:head>

<div class="page">
  <h1>Draft Analysis</h1>
  <p class="subtitle">Annual drafts only — how many points did each pick produce from draft year forward?</p>

  {#if loading}
    <div class="loading"><div class="spinner"></div><p>Pulling draft data and tracing pick outcomes across all seasons…</p></div>
  {:else if error}
    <div class="error">Error: {error}</div>
  {:else if data}

    <div class="controls-row">
      <div class="mode-toggle">
        <button class:active={pointsMode === 'starter'} on:click={() => pointsMode = 'starter'}>Starter Pts</button>
        <button class:active={pointsMode === 'roster'} on:click={() => pointsMode = 'roster'}>Roster Pts</button>
      </div>
      <div class="section-tabs">
        <button class:active={activeSection === 'team'} on:click={() => activeSection = 'team'}>Team View</button>
        <button class:active={activeSection === 'position'} on:click={() => activeSection = 'position'}>Position Groups</button>
        <button class:active={activeSection === 'log'} on:click={() => activeSection = 'log'}>Draft Log</button>
      </div>
    </div>

    {#if activeSection === 'team'}
      <div class="section">
        <h2>Team Draft Summary</h2>
        <div class="chart-row">
          <div class="chart-box"><h3>Total Draft Points by Manager</h3><canvas id="draft-bar-chart"></canvas></div>
          <div class="chart-box"><h3>Year-over-Year Draft Points</h3><canvas id="draft-trend-chart"></canvas></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th on:click={() => setTeamSort('manager')}>Manager{sortArrow('manager', teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort('totalPicks')}>Picks{sortArrow('totalPicks', teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort(totalPtsKey)}>Total Pts{sortArrow(totalPtsKey, teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort(avgPtsKey)}>Avg/Pick{sortArrow(avgPtsKey, teamSortKey, teamSortDir)}</th>
                <th>Best Pick</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedTeams as t}
                <tr>
                  <td class="manager-name">{t.manager}</td>
                  <td>{t.totalPicks}</td>
                  <td>{Math.round(t[totalPtsKey])}</td>
                  <td>{t[avgPtsKey]}</td>
                  <td class="best-pick">
                    {#if t.bestPick}
                      <span class="pos-badge" style="background:{POS_COLORS[t.bestPick.position] || '#95a5a6'}">{t.bestPick.position}</span>
                      {t.bestPick.playerName}
                      <span class="pick-pts">({Math.round(t.bestPick[ptsKey])} pts, {t.bestPick.year} Rd {t.bestPick.round})</span>
                    {:else}—{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <h3>Year-by-Year Breakdown</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Manager</th>
                {#each data.years as yr}<th>{yr}</th>{/each}
              </tr>
            </thead>
            <tbody>
              {#each sortedTeams as t}
                <tr>
                  <td class="manager-name">{t.manager}</td>
                  {#each data.years as yr}
                    <td>{t.yearBreakdown?.[yr] ? Math.round(t.yearBreakdown[yr][ptsKey]) : '—'}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

    {:else if activeSection === 'position'}
      <div class="section">
        <h2>Position Group Breakdown</h2>
        <p class="section-note">Points produced by draft picks, split by position. Click any column header to sort.</p>
        <div class="chart-box wide"><canvas id="draft-pos-chart"></canvas></div>
        <div class="table-wrap">
          <table class="pos-matrix">
            <thead>
              <tr>
                <th class="sticky-col" on:click={() => setPosMgrSort('manager')}>Manager{posMgrSortKey === 'manager' ? (posMgrSortDir === 1 ? ' ▲' : ' ▼') : ''}</th>
                {#each POSITIONS as pos}
                  <th on:click={() => setPosMgrSort(pos)} style="border-top: 3px solid {POS_COLORS[pos]}">
                    {pos}{posMgrSortKey === pos ? (posMgrSortDir === 1 ? ' ▲' : ' ▼') : ''}
                  </th>
                {/each}
                <th on:click={() => setPosMgrSort('total')}>Total{posMgrSortKey === 'total' ? (posMgrSortDir === 1 ? ' ▲' : ' ▼') : ''}</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedPosMgr as row}
                <tr>
                  <td class="sticky-col manager-name">{row.manager}</td>
                  {#each POSITIONS as pos}
                    {@const pct = posMgrMaxes[pos] > 0 ? (row[pos] / posMgrMaxes[pos]) : 0}
                    <td class="heat-cell" style="background: linear-gradient(to right, {POS_COLORS[pos]}26 0%, {POS_COLORS[pos]}26 {pct * 100}%, transparent {pct * 100}%)">
                      {row[pos] || '—'}
                    </td>
                  {/each}
                  <td class="heat-cell total-col" style="background: linear-gradient(to right, rgba(52,152,219,0.15) 0%, rgba(52,152,219,0.15) {posMgrMaxes.total > 0 ? (row.total / posMgrMaxes.total) * 100 : 0}%, transparent {posMgrMaxes.total > 0 ? (row.total / posMgrMaxes.total) * 100 : 0}%)">
                    <strong>{row.total}</strong>
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td class="sticky-col"><strong>League total</strong></td>
                {#each POSITIONS as pos}
                  <td><strong>{Math.round(posMgrRows.reduce((s, r) => s + (r[pos] || 0), 0))}</strong></td>
                {/each}
                <td><strong>{Math.round(posMgrRows.reduce((s, r) => s + (r.total || 0), 0))}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    {:else if activeSection === 'log'}
      <div class="section">
        <h2>Draft Log</h2>
        <div class="filter-row">
          <label>Year:
            <select bind:value={selectedDraftYear}>
              <option value="All">All Drafts</option>
              {#each data.years.slice().reverse() as yr}<option value={yr}>{yr}</option>{/each}
            </select>
          </label>
          <label>Manager:
            <select bind:value={selectedPosManager}>
              <option value="All">All Managers</option>
              {#each data.managers as m}<option value={m}>{m}</option>{/each}
            </select>
          </label>
          <label>Search:
            <input type="text" placeholder="player or manager…" bind:value={logSearch} />
          </label>
        </div>

        {#each filteredDrafts as draft}
          <div class="draft-block">
            <h3 class="draft-year">{draft.year} Draft <span class="draft-type">({draft.draftType}, {draft.rounds} rounds)</span></h3>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rd</th>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>Manager</th>
                    <th>Traded From</th>
                    <th>{pointsMode === 'starter' ? 'Starter Pts' : 'Roster Pts'}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each draft.picks.filter(p => (selectedPosManager === 'All' || p.manager === selectedPosManager) && (!logSearch || p.playerName.toLowerCase().includes(logSearch.toLowerCase()) || p.manager.toLowerCase().includes(logSearch.toLowerCase()))) as pick}
                    <tr class:traded-pick={pick.wasTraded}>
                      <td class="round-cell">{roundLabel(pick.round)}</td>
                      <td class="player-name">{pick.playerName}</td>
                      <td><span class="pos-badge" style="background:{POS_COLORS[pick.position] || '#95a5a6'}">{pick.position}</span></td>
                      <td>{pick.manager}</td>
                      <td class="orig-mgr">{pick.wasTraded ? pick.originalManager : '—'}</td>
                      <td class="pts-cell" class:great={pick[ptsKey] > 500} class:good={pick[ptsKey] > 200 && pick[ptsKey] <= 500}>{Math.round(pick[ptsKey])}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/each}

        {#if filteredDrafts.length === 0}
          <p class="empty">No drafts match filters.</p>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .page { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
  h1 { font-size: 2rem; margin-bottom: 0.25rem; }
  .subtitle { color: var(--g666, #666); margin-bottom: 1.5rem; }
  .loading { text-align: center; padding: 4rem 1rem; }
  .spinner { width: 40px; height: 40px; border: 4px solid var(--ddd, #ddd); border-top-color: var(--color-primary, #3498db); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.35); border-radius: 8px; padding: 1rem; color: #c0392b; }
  .controls-row { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .mode-toggle, .section-tabs { display: flex; border: 1px solid var(--ddd, #ddd); border-radius: 8px; overflow: hidden; }
  .mode-toggle button, .section-tabs button { padding: 0.5rem 1rem; border: none; background: var(--fff, #fff); color: var(--g333, #333); cursor: pointer; font-size: 0.9rem; transition: all 0.15s; }
  .mode-toggle button.active, .section-tabs button.active { background: var(--color-primary, #3498db); color: #fff; }
  .section { animation: fadeIn 0.2s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  h2 { font-size: 1.4rem; margin-bottom: 1rem; }
  h3 { font-size: 1.1rem; margin-bottom: 0.75rem; color: var(--g444, #444); }
  .chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
  .chart-box { background: var(--fff, #fff); border: 1px solid var(--ddd, #ddd); border-radius: 12px; padding: 1.25rem; }
  .chart-box.wide { margin-bottom: 1.5rem; }
  .filter-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; align-items: center; }
  .filter-row label { display: flex; gap: 0.5rem; align-items: center; font-size: 0.9rem; color: var(--g555, #555); }
  .filter-row select, .filter-row input { border: 1px solid var(--ddd, #ddd); border-radius: 6px; padding: 0.35rem 0.6rem; background: var(--fff, #fff); color: var(--g333, #333); font-size: 0.9rem; }
  .table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid var(--ddd, #ddd); margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: var(--eee, #eee); }
  th { padding: 0.75rem 1rem; text-align: left; font-size: 0.85rem; color: var(--g555, #555); cursor: pointer; white-space: nowrap; user-select: none; }
  th:hover { color: var(--color-primary, #3498db); }
  td { padding: 0.65rem 1rem; border-top: 1px solid var(--eee, #eee); font-size: 0.9rem; }
  tr:hover td { background: var(--eee, #f9f9f9); }
  .manager-name { font-weight: 600; }
  .pos-badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; color: #fff; font-size: 0.8rem; font-weight: 700; }
  .best-pick { font-size: 0.85rem; }
  .pick-pts { color: var(--g666, #666); font-size: 0.8rem; }
  .section-note { color: var(--g555, #555); font-size: 0.85rem; margin-bottom: 1rem; }
  .pos-matrix th { cursor: pointer; user-select: none; }
  .pos-matrix th:hover { color: var(--color-primary, #3498db); }
  .sticky-col { position: sticky; left: 0; background: var(--fff, #fff); z-index: 1; }
  thead .sticky-col { background: var(--eee, #eee); }
  .heat-cell { font-weight: 500; white-space: nowrap; }
  .total-col { border-left: 2px solid var(--ddd, #ddd); }
  tfoot .totals-row td { border-top: 2px solid var(--ddd, #ddd); background: var(--eee, #eee); font-size: 0.88rem; }
  .draft-block { margin-bottom: 2rem; }
  .draft-year { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--g222, #222); }
  .draft-type { font-size: 0.85rem; font-weight: 400; color: var(--g666, #666); }
  .round-cell { font-weight: 600; color: var(--g555, #555); font-size: 0.85rem; }
  .player-name { font-weight: 600; }
  .orig-mgr { color: var(--g666, #666); font-size: 0.85rem; font-style: italic; }
  .traded-pick td { background: rgba(241, 196, 15, 0.05); }
  .pts-cell { font-weight: 700; }
  .pts-cell.great { color: #27ae60; }
  .pts-cell.good { color: #2980b9; }
  .empty { text-align: center; padding: 2rem; color: var(--g888, #888); }
  @media (max-width: 768px) { .chart-row { grid-template-columns: 1fr; } }
</style>
