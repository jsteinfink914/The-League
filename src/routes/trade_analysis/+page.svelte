<script>
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import { buildTradeAnalysisData } from '$lib/utils/helperFunctions/tradeAnalysis';

  Chart.register(...registerables);

  const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'Other'];
  const POS_COLORS = { QB: '#e74c3c', RB: '#2ecc71', WR: '#3498db', TE: '#f39c12', Other: '#95a5a6' };
  const CHART_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a','#ff5722','#607d8b','#795548','#ffc107','#673ab7','#34495e'];

  let loading = true;
  let error = null;
  let activeSection = 'team';
  let pointsMode = 'starter';
  let data = null;

  // Team table sort
  let teamSortKey = 'netStarterSurplus';
  let teamSortDir = -1;

  // Position table sort
  let posSortKey = 'starterPts';
  let posSortDir = -1;
  let selectedPosManager = 'All';

  // Trade log filters
  let logFilterManager = 'All';
  let logFilterYear = 'All';
  let logSearch = '';

  // Top 3 best / worst per manager
  $: tradeHighlights = (() => {
    if (!data || logFilterManager === 'All') return null;
    const mgr = logFilterManager;
    const sides = data.trades
      .flatMap(t => t.sides.filter(s => s.manager === mgr).map(s => ({ trade: t, side: s })));
    const netKey2 = pointsMode === 'starter' ? 'netStarterSurplus' : 'netRosterSurplus';
    const sorted = [...sides].sort((a, b) => b.side[netKey2] - a.side[netKey2]);
    return {
      best: sorted.slice(0, 3),
      worst: sorted.slice(-3).reverse()
    };
  })();

  // Most traded players
  let mostTradedSortKey = 'tradeCount';
  let mostTradedSortDir = -1;
  let mostTradedFilterPos = 'All';
  $: mostTradedPlayers = (() => {
    if (!data) return [];
    const counts = new Map(); // playerID -> { name, position, tradeCount, starterPts, rosterPts, managers: Set }
    for (const trade of data.trades) {
      for (const side of trade.sides) {
        for (const pd of side.playerDetails || []) {
          if (!counts.has(pd.playerID)) {
            counts.set(pd.playerID, { playerID: pd.playerID, name: pd.name, position: pd.position, tradeCount: 0, starterPts: 0, rosterPts: 0, managers: new Set() });
          }
          const e = counts.get(pd.playerID);
          e.tradeCount++;
          e.starterPts = Math.round((e.starterPts + pd.starterPts) * 10) / 10;
          e.rosterPts = Math.round((e.rosterPts + pd.rosterPts) * 10) / 10;
          e.managers.add(side.manager);
        }
      }
    }
    return [...counts.values()]
      .map(e => ({ ...e, managerCount: e.managers.size, managers: [...e.managers].sort().join(', ') }))
      .filter(e => mostTradedFilterPos === 'All' || e.position === mostTradedFilterPos);
  })();
  $: sortedMostTraded = [...mostTradedPlayers].sort((a, b) => {
    if (mostTradedSortKey === 'name') return mostTradedSortDir * a.name.localeCompare(b.name);
    return mostTradedSortDir * ((a[mostTradedSortKey] ?? 0) - (b[mostTradedSortKey] ?? 0));
  });

  // Charts
  let barChart = null;
  let posChart = null;
  let surplusChart = null;

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function chartTheme() { return { textColor: cssVar('--g333') || '#333', gridColor: cssVar('--ddd') || '#ddd' }; }

  $: ptsKey = pointsMode === 'starter' ? 'starterPts' : 'rosterPts';
  $: receivedKey = pointsMode === 'starter' ? 'totalReceivedStarter' : 'totalReceivedRoster';
  $: givenKey = pointsMode === 'starter' ? 'totalGivenStarter' : 'totalGivenRoster';
  $: netKey = pointsMode === 'starter' ? 'netStarterSurplus' : 'netRosterSurplus';
  $: avgKey = pointsMode === 'starter' ? 'avgStarterPtsPerTrade' : 'avgRosterPtsPerTrade';

  $: sortedTeams = data
    ? [...data.teamSummary].sort((a, b) => {
        const av = a[teamSortKey] ?? -Infinity, bv = b[teamSortKey] ?? -Infinity;
        return teamSortDir * (av - bv);
      })
    : [];

  $: availableYears = data
    ? [...new Set(data.trades.map(t => t.year))].sort((a, b) => b - a)
    : [];

  $: filteredTrades = data
    ? data.trades.filter(t => {
        const mgrMatch = logFilterManager === 'All' || t.sides.some(s => s.manager === logFilterManager);
        const yrMatch = logFilterYear === 'All' || t.year === Number(logFilterYear);
        const srchMatch = !logSearch || t.sides.some(s =>
          s.playerDetails?.some(p => p.name.toLowerCase().includes(logSearch.toLowerCase())) ||
          s.manager.toLowerCase().includes(logSearch.toLowerCase())
        );
        return mgrMatch && yrMatch && srchMatch;
      })
    : [];

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

  function setTeamSort(key) {
    if (teamSortKey === key) teamSortDir *= -1;
    else { teamSortKey = key; teamSortDir = -1; }
  }
  function setPosSort(key) {
    if (posSortKey === key) posSortDir *= -1;
    else { posSortKey = key; posSortDir = -1; }
  }
  function sortArrow(key, currentKey, dir) { return currentKey === key ? (dir === 1 ? ' ▲' : ' ▼') : ''; }

  function drawBarChart() {
    const el = document.getElementById('trade-bar-chart');
    if (!el || !data) return;
    if (barChart) barChart.destroy();
    const { textColor, gridColor } = chartTheme();
    const sorted = [...data.teamSummary].sort((a, b) => b[receivedKey] - a[receivedKey]);
    barChart = new Chart(el, {
      type: 'bar',
      data: {
        labels: sorted.map(t => t.manager),
        datasets: [
          { label: 'Points Received', data: sorted.map(t => Math.round(t[receivedKey])), backgroundColor: '#3498db99', borderColor: '#3498db', borderWidth: 1 },
          { label: 'Points Given Away', data: sorted.map(t => Math.round(t[givenKey])), backgroundColor: '#e74c3c99', borderColor: '#e74c3c', borderWidth: 1 }
        ]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: textColor } } }, scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } } }
    });
  }

  function drawPosChart() {
    const el = document.getElementById('trade-pos-chart');
    if (!el || !data) return;
    if (posChart) posChart.destroy();
    const { textColor, gridColor } = chartTheme();
    const sorted = [...data.teamSummary].sort((a, b) => b[receivedKey] - a[receivedKey]);
    const datasets = POSITIONS.map(pos => ({
      label: pos,
      data: sorted.map(t => Math.round((t.posBreakdown?.[pos]?.[ptsKey] || 0) * 10) / 10),
      backgroundColor: POS_COLORS[pos] + '99',
      borderColor: POS_COLORS[pos],
      borderWidth: 1
    }));
    posChart = new Chart(el, {
      type: 'bar',
      data: { labels: sorted.map(t => t.manager), datasets },
      options: { responsive: true, plugins: { legend: { labels: { color: textColor } } }, scales: { x: { stacked: true, ticks: { color: textColor }, grid: { color: gridColor } }, y: { stacked: true, ticks: { color: textColor }, grid: { color: gridColor } } } }
    });
  }

  function drawSurplusChart() {
    const el = document.getElementById('trade-surplus-chart');
    if (!el || !data) return;
    if (surplusChart) surplusChart.destroy();
    const { textColor, gridColor } = chartTheme();
    const sorted = [...data.teamSummary].sort((a, b) => b[netKey] - a[netKey]);
    surplusChart = new Chart(el, {
      type: 'bar',
      data: {
        labels: sorted.map(t => t.manager),
        datasets: [{ label: 'Net Surplus', data: sorted.map(t => t[netKey]), backgroundColor: sorted.map(t => t[netKey] >= 0 ? '#2ecc7199' : '#e74c3c99'), borderColor: sorted.map(t => t[netKey] >= 0 ? '#2ecc71' : '#e74c3c'), borderWidth: 1 }]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: textColor } } }, scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } } }
    });
  }

  $: if (activeSection === 'team' && data) { setTimeout(() => { drawBarChart(); drawSurplusChart(); }, 50); }
  $: if (activeSection === 'position' && data) { setTimeout(() => { drawPosChart(); }, 50); }
  $: if (data && activeSection === 'team') { setTimeout(drawBarChart, 50); setTimeout(drawSurplusChart, 50); }
  $: if (data && activeSection === 'position') { setTimeout(drawPosChart, 50); }
  $: if (selectedPosManager && data && activeSection === 'position') { setTimeout(drawPosChart, 50); }
  $: if (pointsMode && data) { setTimeout(() => { if (activeSection === 'team') { drawBarChart(); drawSurplusChart(); } if (activeSection === 'position') drawPosChart(); }, 50); }

  function ordinal(n) { const s = ['th','st','nd','rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function roundLabel(r) { const labels = ['1st','2nd','3rd','4th','5th','6th','7th','8th']; return labels[r - 1] || `${r}th`; }

  onMount(async () => {
    try {
      const playersRes = await fetch('https://api.sleeper.app/v1/players/nfl');
      if (!playersRes.ok) throw new Error(`Player data request failed (${playersRes.status}).`);
      const players = await playersRes.json();
      data = await buildTradeAnalysisData({ players });
    } catch (e) {
      console.error(e);
      error = e.message;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>Trade Analysis</title></svelte:head>

<div class="page">
  <h1>Trade Analysis</h1>
  <p class="subtitle">Post-trade outcomes — how many points did acquired assets produce?</p>

  {#if loading}
    <div class="loading"><div class="spinner"></div><p>Crunching trade data across all seasons…</p><p class="sub">This traces every pick to the player drafted with it — may take a moment.</p></div>
  {:else if error}
    <div class="error" role="alert">Trade analysis is temporarily unavailable: {error} <button type="button" on:click={() => window.location.reload()}>Retry</button></div>
  {:else if data}

    <div class="controls-row">
      <div class="mode-toggle">
        <button class:active={pointsMode === 'starter'} on:click={() => pointsMode = 'starter'}>Starter Pts</button>
        <button class:active={pointsMode === 'roster'} on:click={() => pointsMode = 'roster'}>Roster Pts</button>
      </div>
      <div class="section-tabs">
        <button class:active={activeSection === 'team'} on:click={() => activeSection = 'team'}>Team View</button>
        <button class:active={activeSection === 'position'} on:click={() => activeSection = 'position'}>Position Groups</button>
        <button class:active={activeSection === 'players'} on:click={() => activeSection = 'players'}>Most Traded</button>
        <button class:active={activeSection === 'log'} on:click={() => activeSection = 'log'}>Trade Log</button>
      </div>
    </div>

    {#if activeSection === 'team'}
      <div class="section">
        <h2>Team Trade Summary</h2>
        <div class="chart-row">
          <div class="chart-box"><h3>Points Received vs Given Away</h3><canvas id="trade-bar-chart"></canvas></div>
          <div class="chart-box"><h3>Net Point Surplus by Manager</h3><canvas id="trade-surplus-chart"></canvas></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th on:click={() => setTeamSort('manager')}>Manager{sortArrow('manager', teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort('tradeCount')}>Trades{sortArrow('tradeCount', teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort(receivedKey)}>Pts Received{sortArrow(receivedKey, teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort(givenKey)}>Pts Given{sortArrow(givenKey, teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort(netKey)}>Net Surplus{sortArrow(netKey, teamSortKey, teamSortDir)}</th>
                <th on:click={() => setTeamSort(avgKey)}>Avg/Trade{sortArrow(avgKey, teamSortKey, teamSortDir)}</th>
                <th>Pending Picks</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedTeams as t}
                <tr>
                  <td class="manager-name">{t.manager}</td>
                  <td>{t.tradeCount}</td>
                  <td>{Math.round(t[receivedKey])}</td>
                  <td>{Math.round(t[givenKey])}</td>
                  <td class:positive={t[netKey] > 0} class:negative={t[netKey] < 0}>{t[netKey] > 0 ? '+' : ''}{t[netKey]}</td>
                  <td>{t[avgKey]}</td>
                  <td>{#if t.pendingPickCount > 0}<span class="pending-badge">{t.pendingPickCount} pending</span>{:else}—{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

    {:else if activeSection === 'position'}
      <div class="section">
        <h2>Position Group Breakdown</h2>
        <p class="section-note">Points produced by assets acquired in trades, split by position. Click any column header to sort.</p>
        <div class="chart-box wide"><canvas id="trade-pos-chart"></canvas></div>
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

    {:else if activeSection === 'players'}
      <div class="section">
        <h2>Most Traded Players</h2>
        <div class="filter-row">
          <label>Position:
            <select bind:value={mostTradedFilterPos}>
              <option value="All">All Positions</option>
              {#each POSITIONS as pos}<option value={pos}>{pos}</option>{/each}
            </select>
          </label>
          <span class="result-count">{sortedMostTraded.length} players</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="rank-col">#</th>
                <th on:click={() => { if (mostTradedSortKey === 'name') mostTradedSortDir *= -1; else { mostTradedSortKey = 'name'; mostTradedSortDir = 1; } }}>Player{mostTradedSortKey === 'name' ? (mostTradedSortDir === 1 ? ' ▲' : ' ▼') : ''}</th>
                <th>Pos</th>
                <th on:click={() => { if (mostTradedSortKey === 'tradeCount') mostTradedSortDir *= -1; else { mostTradedSortKey = 'tradeCount'; mostTradedSortDir = -1; } }}>Times Traded{mostTradedSortKey === 'tradeCount' ? (mostTradedSortDir === 1 ? ' ▲' : ' ▼') : ''}</th>
                <th on:click={() => { if (mostTradedSortKey === 'managerCount') mostTradedSortDir *= -1; else { mostTradedSortKey = 'managerCount'; mostTradedSortDir = -1; } }}>Managers Involved{mostTradedSortKey === 'managerCount' ? (mostTradedSortDir === 1 ? ' ▲' : ' ▼') : ''}</th>
                <th on:click={() => { if (mostTradedSortKey === (pointsMode === 'starter' ? 'starterPts' : 'rosterPts')) mostTradedSortDir *= -1; else { mostTradedSortKey = pointsMode === 'starter' ? 'starterPts' : 'rosterPts'; mostTradedSortDir = -1; } }}>Pts Produced{mostTradedSortKey === (pointsMode === 'starter' ? 'starterPts' : 'rosterPts') ? (mostTradedSortDir === 1 ? ' ▲' : ' ▼') : ''}</th>
                <th>Traded By</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedMostTraded as player, i}
                <tr class:pos-qb={player.position === 'QB'} class:pos-rb={player.position === 'RB'} class:pos-wr={player.position === 'WR'} class:pos-te={player.position === 'TE'}>
                  <td class="rank-col">{i + 1}</td>
                  <td><strong>{player.name}</strong></td>
                  <td><span class="pos-badge" style="background: {POS_COLORS[player.position] || POS_COLORS.Other}">{player.position}</span></td>
                  <td><strong>{player.tradeCount}</strong></td>
                  <td>{player.managerCount}</td>
                  <td>{pointsMode === 'starter' ? player.starterPts : player.rosterPts}</td>
                  <td class="managers-cell">{player.managers}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

    {:else if activeSection === 'log'}
      <div class="section">
        <h2>Trade Log</h2>
        <div class="filter-row">
          <label>Manager:
            <select bind:value={logFilterManager}>
              <option value="All">All Managers</option>
              {#each data.managers as m}<option value={m}>{m}</option>{/each}
            </select>
          </label>
          <label>Year:
            <select bind:value={logFilterYear}>
              <option value="All">All Years</option>
              {#each availableYears as y}<option value={y}>{y}</option>{/each}
            </select>
          </label>
          <label>Search:
            <input type="text" placeholder="player or manager…" bind:value={logSearch} />
          </label>
        </div>
        <p class="result-count">{filteredTrades.length} trades shown</p>

        {#if tradeHighlights}
          <div class="highlights-row">
            <div class="highlights-box best-box">
              <h3>🏆 Best Trades ({logFilterManager})</h3>
              {#each tradeHighlights.best as { trade, side }}
                <div class="highlight-item">
                  <span class="h-date">{trade.date}</span>
                  <span class="h-assets">{side.playerDetails.map(p => p.name).concat(side.pickDetails.filter(p => p.resolvedName).map(p => p.resolvedName)).join(', ') || '—'}</span>
                  <span class="h-net positive">+{side[pointsMode === 'starter' ? 'netStarterSurplus' : 'netRosterSurplus']} pts</span>
                </div>
              {/each}
            </div>
            <div class="highlights-box worst-box">
              <h3>📉 Worst Trades ({logFilterManager})</h3>
              {#each tradeHighlights.worst as { trade, side }}
                <div class="highlight-item">
                  <span class="h-date">{trade.date}</span>
                  <span class="h-assets">{side.playerDetails.map(p => p.name).concat(side.pickDetails.filter(p => p.resolvedName).map(p => p.resolvedName)).join(', ') || '—'}</span>
                  <span class="h-net negative">{side[pointsMode === 'starter' ? 'netStarterSurplus' : 'netRosterSurplus']} pts</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="trade-log">
          {#each filteredTrades as trade}
            <div class="trade-card">
              <div class="trade-header">
                <span class="trade-date">{trade.date}</span>
                <span class="trade-year-badge">{trade.year}</span>
                {#if trade.sides.some(s => s.pendingPickCount > 0)}
                  <span class="pending-indicator">⏳ Pending picks</span>
                {/if}
              </div>
              <div class="trade-sides" style="grid-template-columns: repeat({trade.sides.length}, 1fr)">
                {#each trade.sides as side}
                  <div class="trade-side">
                    <div class="side-header">
                      <strong>{side.manager}</strong>
                      <div class="side-pts">
                        <span class="pts-received">{side[ptsKey]} pts</span>
                        <span class="pts-net" class:pos={side[pointsMode === 'starter' ? 'netStarterSurplus' : 'netRosterSurplus'] > 0} class:neg={side[pointsMode === 'starter' ? 'netStarterSurplus' : 'netRosterSurplus'] < 0}>
                          {side[pointsMode === 'starter' ? 'netStarterSurplus' : 'netRosterSurplus'] > 0 ? '+' : ''}{side[pointsMode === 'starter' ? 'netStarterSurplus' : 'netRosterSurplus']} net
                        </span>
                      </div>
                    </div>
                    <div class="assets">
                      {#each side.playerDetails as pd}
                        <div class="asset-row">
                          <span class="pos-dot" style="background:{POS_COLORS[pd.position] || '#95a5a6'}">{pd.position}</span>
                          <span class="asset-name">{pd.name}</span>
                          <span class="asset-pts">{pd[ptsKey]} pts</span>
                        </div>
                      {/each}
                      {#each side.pickDetails as pd}
                        <div class="asset-row pick-row" class:pending={pd.isPending}>
                          <span class="pos-dot pick-dot">{roundLabel(pd.round)}</span>
                          {#if pd.isPending}
                            <span class="asset-name pending-name">{pd.season} {roundLabel(pd.round)} pick <span class="pending-tag">PENDING</span></span>
                            <span class="asset-pts">—</span>
                          {:else if pd.resolvedName}
                            <span class="asset-name">{pd.resolvedName} <span class="pick-via">(via pick)</span></span>
                            <span class="asset-pts">{pd[ptsKey]} pts</span>
                          {:else}
                            <span class="asset-name">{pd.season} {roundLabel(pd.round)} pick</span>
                            <span class="asset-pts">—</span>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
          {#if filteredTrades.length === 0}
            <p class="empty">No trades match the current filters.</p>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
  h1 { font-size: 2rem; margin-bottom: 0.25rem; }
  .subtitle { color: var(--g666, #666); margin-bottom: 1.5rem; }
  .loading { text-align: center; padding: 4rem 1rem; }
  .loading .sub { color: var(--g666, #666); font-size: 0.9rem; }
  .spinner { width: 40px; height: 40px; border: 4px solid var(--ddd, #ddd); border-top-color: var(--color-primary, #3498db); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.35); border-radius: 8px; padding: 1rem; color: #c0392b; }
  .controls-row { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .mode-toggle, .section-tabs { display: flex; gap: 0; border: 1px solid var(--ddd, #ddd); border-radius: 8px; overflow: hidden; }
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
  .result-count { color: var(--g666, #666); font-size: 0.85rem; margin-bottom: 0.75rem; }
  .table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid var(--ddd, #ddd); margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: var(--eee, #eee); }
  th { padding: 0.75rem 1rem; text-align: left; font-size: 0.85rem; color: var(--g555, #555); cursor: pointer; white-space: nowrap; user-select: none; }
  th:hover { color: var(--color-primary, #3498db); }
  td { padding: 0.65rem 1rem; border-top: 1px solid var(--eee, #eee); font-size: 0.9rem; }
  tr:hover td { background: var(--eee, #f9f9f9); }
  .manager-name { font-weight: 600; }
  .positive { color: #27ae60; font-weight: 600; }
  .negative { color: #e74c3c; font-weight: 600; }
  .pending-badge { background: rgba(241, 196, 15, 0.18); color: #9a7000; border-radius: 12px; padding: 0.2rem 0.5rem; font-size: 0.78rem; font-weight: 600; }
  .pos-badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; color: #fff; font-size: 0.8rem; font-weight: 700; }
  .section-note { color: var(--g555, #555); font-size: 0.85rem; margin-bottom: 1rem; }
  .pos-matrix th { cursor: pointer; user-select: none; }
  .pos-matrix th:hover { color: var(--color-primary, #3498db); }
  .sticky-col { position: sticky; left: 0; background: var(--fff, #fff); z-index: 1; }
  thead .sticky-col { background: var(--eee, #eee); }
  .heat-cell { font-weight: 500; white-space: nowrap; }
  .total-col { border-left: 2px solid var(--ddd, #ddd); }
  tfoot .totals-row td { border-top: 2px solid var(--ddd, #ddd); background: var(--eee, #eee); font-size: 0.88rem; }
  .trade-log { display: flex; flex-direction: column; gap: 1rem; }
  .trade-card { background: var(--fff, #fff); border: 1px solid var(--ddd, #ddd); border-radius: 12px; overflow: hidden; }
  .trade-header { display: flex; gap: 0.75rem; align-items: center; padding: 0.75rem 1rem; background: var(--eee, #eee); border-bottom: 1px solid var(--ddd, #ddd); }
  .trade-date { color: var(--g555, #555); font-size: 0.85rem; }
  .trade-year-badge { background: var(--color-primary, #3498db); color: #fff; border-radius: 10px; padding: 0.1rem 0.5rem; font-size: 0.75rem; font-weight: 700; }
  .pending-indicator { color: #9a7000; font-size: 0.82rem; }
  .trade-sides { display: grid; gap: 0; }
  .trade-side { padding: 1rem; border-right: 1px solid var(--eee, #eee); }
  .trade-side:last-child { border-right: none; }
  .side-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.25rem; }
  .side-header strong { font-size: 0.95rem; }
  .side-pts { display: flex; flex-direction: column; align-items: flex-end; font-size: 0.82rem; }
  .pts-received { color: var(--color-primary, #3498db); font-weight: 600; }
  .pts-net.pos { color: #27ae60; font-weight: 600; }
  .pts-net.neg { color: #e74c3c; font-weight: 600; }
  .assets { display: flex; flex-direction: column; gap: 0.4rem; }
  .asset-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
  .pos-dot { display: inline-block; border-radius: 4px; padding: 0.1rem 0.35rem; color: #fff; font-size: 0.72rem; font-weight: 700; white-space: nowrap; }
  .pick-dot { background: #607d8b !important; }
  .asset-name { flex: 1; color: var(--g333, #333); }
  .asset-pts { color: var(--g555, #555); white-space: nowrap; font-weight: 600; }
  .pick-row.pending { opacity: 0.7; }
  .pending-name { display: flex; align-items: center; gap: 0.35rem; }
  .pending-tag { background: rgba(241, 196, 15, 0.18); color: #9a7000; border-radius: 8px; padding: 0.1rem 0.4rem; font-size: 0.72rem; font-weight: 700; }
  .pick-via { color: var(--g888, #888); font-size: 0.78rem; }
  .highlights-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem; }
  .highlights-box { border-radius: 10px; border: 1px solid var(--ddd, #ddd); padding: 1rem; }
  .best-box { border-left: 3px solid #27ae60; }
  .worst-box { border-left: 3px solid #e74c3c; }
  .highlights-box h3 { font-size: 0.95rem; margin: 0 0 0.75rem; }
  .highlight-item { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.82rem; padding: 0.3rem 0; border-top: 1px solid var(--eee, #eee); }
  .highlight-item:first-of-type { border-top: none; }
  .h-date { color: var(--g555, #555); white-space: nowrap; flex-shrink: 0; }
  .h-assets { flex: 1; color: var(--g333, #333); }
  .h-net { white-space: nowrap; font-weight: 700; flex-shrink: 0; }
  .rank-col { width: 2.5rem; text-align: center; color: var(--g555, #555); }
  .managers-cell { font-size: 0.82rem; color: var(--g555, #555); max-width: 260px; }
  .empty { text-align: center; padding: 2rem; color: var(--g888, #888); }
  @media (max-width: 768px) {
    .highlights-row { grid-template-columns: 1fr; }
    .chart-row { grid-template-columns: 1fr; }
    .trade-sides { grid-template-columns: 1fr !important; }
    .trade-side { border-right: none; border-top: 1px solid var(--eee, #eee); }
    .trade-side:first-child { border-top: none; }
  }
</style>
