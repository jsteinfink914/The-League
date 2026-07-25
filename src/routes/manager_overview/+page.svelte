<script>
  import { onMount } from 'svelte';
  import Papa from 'papaparse';
  import { Chart, registerables } from 'chart.js';
  import { buildCapAnalysisData } from '$lib/utils/helperFunctions/capAnalysis';
  import { buildTradeAnalysisData } from '$lib/utils/helperFunctions/tradeAnalysis';
  import { buildDraftAnalysisData } from '$lib/utils/helperFunctions/draftAnalysis';
  import {
    buildRookieContracts,
    buildValueIndexes,
    parseFantasyProsMarketCsv,
  } from '$lib/utils/playerNameLookup';

  Chart.register(...registerables);

  const CHART_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a','#ff5722','#607d8b','#795548','#ffc107','#673ab7','#34495e'];
  const VALUE_YEAR = '2026';

  let loading = true;
  let loadingStep = 'Loading player data…';
  let error = null;
  let activeTab = 'leaderboard';

  let capData = null;
  let tradeData = null;
  let draftData = null;
  let combined = [];
  let selectedManager = null;

  let overviewSortKey = 'avgRank';
  let overviewSortDir = 1;

  let radarChart = null;

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function chartTheme() { return { textColor: cssVar('--g333') || '#333', gridColor: cssVar('--ddd') || '#ddd' }; }

  function rankArray(arr, key, ascending = false) {
    const valid = arr.filter(a => a[key] != null);
    const sorted = [...valid].sort((a, b) => ascending ? a[key] - b[key] : b[key] - a[key]);
    const result = {};
    sorted.forEach((item, i) => { result[item.manager] = i + 1; });
    return result;
  }

  function buildCombined() {
    if (!capData || !tradeData || !draftData) return [];

    const allManagers = [...new Set([
      ...capData.teamEfficiency.map(t => t.manager),
      ...tradeData.teamSummary.map(t => t.manager),
      ...draftData.teamSummary.map(t => t.manager)
    ])].sort();

    const capRanks = rankArray(capData.teamEfficiency.filter(t => t.dollarPerStarterPt != null), 'dollarPerStarterPt', true);
    const tradeRanks = rankArray(tradeData.teamSummary, 'netStarterSurplus', false);
    const draftRanks = rankArray(draftData.teamSummary, 'totalStarterPts', false);

    return allManagers.map(mgr => {
      const cap = capData.teamEfficiency.find(t => t.manager === mgr);
      const trade = tradeData.teamSummary.find(t => t.manager === mgr);
      const draft = draftData.teamSummary.find(t => t.manager === mgr);

      const capRank = capRanks[mgr] ?? null;
      const tradeRank = tradeRanks[mgr] ?? null;
      const draftRank = draftRanks[mgr] ?? null;

      const ranks = [capRank, tradeRank, draftRank].filter(r => r != null);
      const avgRank = ranks.length > 0 ? Math.round((ranks.reduce((s, r) => s + r, 0) / ranks.length) * 10) / 10 : null;

      return {
        manager: mgr, capRank, tradeRank, draftRank, avgRank,
        dollarPerStarterPt: cap?.dollarPerStarterPt ?? null,
        capStarterPts: cap?.starterPts ?? 0,
        netTradeSurplus: trade?.netStarterSurplus ?? 0,
        totalReceivedStarter: trade?.totalReceivedStarter ?? 0,
        tradeCount: trade?.tradeCount ?? 0,
        draftTotalPts: draft?.totalStarterPts ?? 0,
        draftAvgPtsPerPick: draft?.avgStarterPtsPerPick ?? 0,
        bestDraftPick: draft?.bestPick ?? null,
        pendingPickCount: trade?.pendingPickCount ?? 0,
      };
    });
  }

  $: sortedCombined = [...combined].sort((a, b) => {
    const av = a[overviewSortKey] ?? (overviewSortDir === 1 ? Infinity : -Infinity);
    const bv = b[overviewSortKey] ?? (overviewSortDir === 1 ? Infinity : -Infinity);
    if (typeof av === 'string') return overviewSortDir * av.localeCompare(bv);
    return overviewSortDir * (av - bv);
  });

  function setSort(key, defaultDir = -1) {
    if (overviewSortKey === key) overviewSortDir *= -1;
    else { overviewSortKey = key; overviewSortDir = defaultDir; }
  }
  function sortArrow(key) { return overviewSortKey === key ? (overviewSortDir === 1 ? ' ▲' : ' ▼') : ''; }

  function rankBadgeClass(rank, total) {
    if (!rank || !total) return '';
    const pct = rank / total;
    if (pct <= 0.25) return 'rank-top';
    if (pct <= 0.5) return 'rank-mid';
    return 'rank-bot';
  }

  function drawRadar() {
    const el = document.getElementById('radar-chart');
    if (!el || !combined.length) return;
    if (radarChart) radarChart.destroy();
    const { textColor, gridColor } = chartTheme();
    const total = combined.length;
    const datasets = combined.map((row, i) => ({
      label: row.manager,
      data: [
        row.capRank ? total + 1 - row.capRank : 0,
        row.tradeRank ? total + 1 - row.tradeRank : 0,
        row.draftRank ? total + 1 - row.draftRank : 0,
      ],
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '22',
      borderWidth: 2, pointRadius: 3
    }));
    radarChart = new Chart(el, {
      type: 'radar',
      data: { labels: ['Cap Efficiency', 'Trade Surplus', 'Draft Output'], datasets },
      options: {
        responsive: true,
        scales: { r: { min: 0, max: total, ticks: { color: textColor, stepSize: Math.ceil(total / 4) }, grid: { color: gridColor }, pointLabels: { color: textColor, font: { size: 13 } } } },
        plugins: { legend: { labels: { color: textColor, boxWidth: 12, font: { size: 11 } } } }
      }
    });
  }

  $: if (combined.length && activeTab === 'radar') setTimeout(drawRadar, 50);

  onMount(async () => {
    try {
      loadingStep = 'Loading player data…';
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
        playerMappings.filter(e => e.Sleeper && e.Fantasy_Pros).map(e => [e.Sleeper, e.Fantasy_Pros])
      );

      const managerMappings = Papa.parse(managerMapText, { header: true }).data;
      const managerMapRaw = new Map(managerMappings.map(e => [e.Index, e.Name]));

      const playerValues = Papa.parse(playerValuesText, { header: true, skipEmptyLines: true }).data;
      const historyRows = playerValues
        .filter(e => e.Year && e.Name)
        .map(e => ({ Year: Number(e.Year), Name: String(e.Name).trim(), Value: parseFloat(e.Value) || 0, Rookie: Number(e.Rookie) === 1 ? 1 : 0 }));

      const yearRows = historyRows.filter(e => String(e.Year) === VALUE_YEAR);
      const valueIndexes = { ...buildValueIndexes(yearRows), sleeperToFantasyPros };
      const rookieContracts = buildRookieContracts(historyRows);

      let marketValueByName = new Map();
      try {
        const mktRes = await fetch(`/fantasypros-${VALUE_YEAR}.csv`);
        if (mktRes.ok) marketValueByName = parseFantasyProsMarketCsv(await mktRes.text());
      } catch (e) { console.warn('FP market file not loaded:', e); }

      let preloadedHistory = null;
      try {
        const histRes = await fetch('/cap-history.json');
        if (histRes.ok) {
          const histJson = await histRes.json();
          if (Array.isArray(histJson.seasonTrends)) {
            preloadedHistory = histJson.seasonTrends;
          }
        }
      } catch (e) { console.warn('[ManagerOverview] cap-history.json not available:', e.message); }

      loadingStep = 'Building cap analysis…';
      capData = await buildCapAnalysisData({ historyRows, marketValueByName, rookieContracts, valueIndexes, players: nflPlayers, managerMapRaw, valueYear: VALUE_YEAR, preloadedHistory });

      loadingStep = 'Building trade analysis…';
      tradeData = await buildTradeAnalysisData({ players: nflPlayers });

      loadingStep = 'Building draft analysis…';
      draftData = await buildDraftAnalysisData({ players: nflPlayers });

      combined = buildCombined();
    } catch (e) {
      console.error(e);
      error = e.message;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>Manager Overview</title></svelte:head>

<div class="page">
  <h1>Manager Overview</h1>
  <p class="subtitle">Side-by-side ranks across cap efficiency, trade outcomes, and draft output — no composite score.</p>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>{loadingStep}</p>
      <p class="sub">Aggregating all three dimensions — this may take a couple of minutes.</p>
    </div>
  {:else if error}
    <div class="error">Error loading data: {error}</div>
  {:else if combined.length}

    <div class="tab-bar">
      <button class:active={activeTab === 'leaderboard'} on:click={() => activeTab = 'leaderboard'}>Leaderboard</button>
      <button class:active={activeTab === 'radar'} on:click={() => activeTab = 'radar'}>Radar Chart</button>
      <button class:active={activeTab === 'cards'} on:click={() => activeTab = 'cards'}>Manager Cards</button>
    </div>

    {#if activeTab === 'leaderboard'}
      <div class="section">
        <h2>All-Dimension Leaderboard</h2>
        <p class="note">
          Ranks are independent — no composite score. Lower rank # = better.
          <strong>Cap rank</strong>: lowest $/starter pt.
          <strong>Trade rank</strong>: highest net point surplus received.
          <strong>Draft rank</strong>: highest total starter points from picks.
          Avg rank is the mean of the three.
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th on:click={() => setSort('manager', 1)}>Manager{sortArrow('manager')}</th>
                <th on:click={() => setSort('capRank', 1)} title="Lower = more efficient cap spending">Cap Rank{sortArrow('capRank')}</th>
                <th on:click={() => setSort('dollarPerStarterPt', 1)}>$/Starter Pt{sortArrow('dollarPerStarterPt')}</th>
                <th on:click={() => setSort('tradeRank', 1)} title="Lower = more points gained in trades">Trade Rank{sortArrow('tradeRank')}</th>
                <th on:click={() => setSort('netTradeSurplus', -1)}>Net Surplus{sortArrow('netTradeSurplus')}</th>
                <th on:click={() => setSort('draftRank', 1)} title="Lower = most total points from draft picks">Draft Rank{sortArrow('draftRank')}</th>
                <th on:click={() => setSort('draftTotalPts', -1)}>Draft Pts{sortArrow('draftTotalPts')}</th>
                <th on:click={() => setSort('avgRank', 1)}>Avg Rank{sortArrow('avgRank')}</th>
                {#if combined.some(m => m.pendingPickCount > 0)}<th>Pending</th>{/if}
              </tr>
            </thead>
            <tbody>
              {#each sortedCombined as row}
                {@const n = combined.length}
                <tr class:selected-row={selectedManager === row.manager} on:click={() => selectedManager = selectedManager === row.manager ? null : row.manager}>
                  <td class="manager-name">{row.manager}</td>
                  <td><span class="rank-badge {rankBadgeClass(row.capRank, n)}">{row.capRank ?? '—'}</span></td>
                  <td>{row.dollarPerStarterPt != null ? `$${row.dollarPerStarterPt}` : '—'}</td>
                  <td><span class="rank-badge {rankBadgeClass(row.tradeRank, n)}">{row.tradeRank ?? '—'}</span></td>
                  <td class:positive={row.netTradeSurplus > 0} class:negative={row.netTradeSurplus < 0}>{row.netTradeSurplus > 0 ? '+' : ''}{row.netTradeSurplus}</td>
                  <td><span class="rank-badge {rankBadgeClass(row.draftRank, n)}">{row.draftRank ?? '—'}</span></td>
                  <td>{Math.round(row.draftTotalPts)}</td>
                  <td class="avg-rank-cell"><strong>{row.avgRank ?? '—'}</strong></td>
                  {#if combined.some(m => m.pendingPickCount > 0)}
                    <td>{#if row.pendingPickCount > 0}<span class="pending-badge">{row.pendingPickCount}</span>{:else}—{/if}</td>
                  {/if}
                </tr>
                {#if selectedManager === row.manager}
                  <tr class="expand-row">
                    <td colspan="99">
                      <div class="expand-detail">
                        <div class="detail-col">
                          <h4>⚡ Cap Efficiency</h4>
                          <p>Rank: <strong>#{row.capRank ?? '—'}</strong></p>
                          <p>$/Starter Pt: <strong>{row.dollarPerStarterPt != null ? `$${row.dollarPerStarterPt}` : '—'}</strong></p>
                          <p>Starter Pts (cap year): <strong>{Math.round(row.capStarterPts)}</strong></p>
                        </div>
                        <div class="detail-col">
                          <h4>🔄 Trade Outcomes</h4>
                          <p>Rank: <strong>#{row.tradeRank ?? '—'}</strong></p>
                          <p>Net Surplus: <strong class:positive={row.netTradeSurplus > 0} class:negative={row.netTradeSurplus < 0}>{row.netTradeSurplus > 0 ? '+' : ''}{row.netTradeSurplus}</strong></p>
                          <p>Trades Made: <strong>{row.tradeCount}</strong></p>
                          <p>Total Pts Received: <strong>{Math.round(row.totalReceivedStarter)}</strong></p>
                          {#if row.pendingPickCount > 0}<p class="pending-note">⏳ {row.pendingPickCount} pending pick(s) not yet counted</p>{/if}
                        </div>
                        <div class="detail-col">
                          <h4>📋 Draft Output</h4>
                          <p>Rank: <strong>#{row.draftRank ?? '—'}</strong></p>
                          <p>Total Pts: <strong>{Math.round(row.draftTotalPts)}</strong></p>
                          <p>Avg/Pick: <strong>{row.draftAvgPtsPerPick}</strong></p>
                          {#if row.bestDraftPick}<p>Best Pick: <strong>{row.bestDraftPick.playerName}</strong> ({Math.round(row.bestDraftPick.starterPts)} pts, {row.bestDraftPick.year} Rd {row.bestDraftPick.round})</p>{/if}
                        </div>
                      </div>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
        <p class="hint">Click a row to expand full breakdown.</p>
      </div>

    {:else if activeTab === 'radar'}
      <div class="section">
        <h2>Multi-Dimension Radar</h2>
        <p class="note">Each axis = relative rank among managers (higher = better). A manager dominant in all three dimensions will have a large triangle.</p>
        <div class="radar-wrap">
          <canvas id="radar-chart"></canvas>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Manager</th>
                <th>Cap Rank</th>
                <th>Trade Rank</th>
                <th>Draft Rank</th>
                <th>Avg Rank</th>
              </tr>
            </thead>
            <tbody>
              {#each [...combined].sort((a,b) => (a.avgRank ?? 999) - (b.avgRank ?? 999)) as row}
                {@const n = combined.length}
                <tr>
                  <td class="manager-name">{row.manager}</td>
                  <td><span class="rank-badge {rankBadgeClass(row.capRank, n)}">{row.capRank != null ? `#${row.capRank}` : '—'}</span></td>
                  <td><span class="rank-badge {rankBadgeClass(row.tradeRank, n)}">{row.tradeRank != null ? `#${row.tradeRank}` : '—'}</span></td>
                  <td><span class="rank-badge {rankBadgeClass(row.draftRank, n)}">{row.draftRank != null ? `#${row.draftRank}` : '—'}</span></td>
                  <td class="avg-rank-cell"><strong>{row.avgRank ?? '—'}</strong></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

    {:else if activeTab === 'cards'}
      <div class="section">
        <h2>Manager Cards</h2>
        <div class="cards-grid">
          {#each [...combined].sort((a,b) => (a.avgRank ?? 999) - (b.avgRank ?? 999)) as row}
            {@const n = combined.length}
            <div class="manager-card">
              <div class="card-header">
                <h3>{row.manager}</h3>
                {#if row.avgRank != null}<span class="avg-rank-badge">Avg #{row.avgRank}</span>{/if}
              </div>
              <div class="card-dims">
                <div class="card-dim">
                  <div class="dim-label">Cap</div>
                  <div class="rank-badge {rankBadgeClass(row.capRank, n)} big">#{row.capRank ?? '—'}</div>
                  <div class="dim-sub">{row.dollarPerStarterPt != null ? `$${row.dollarPerStarterPt}/pt` : '—'}</div>
                </div>
                <div class="card-dim">
                  <div class="dim-label">Trades</div>
                  <div class="rank-badge {rankBadgeClass(row.tradeRank, n)} big">#{row.tradeRank ?? '—'}</div>
                  <div class="dim-sub" class:positive={row.netTradeSurplus > 0} class:negative={row.netTradeSurplus < 0}>{row.netTradeSurplus > 0 ? '+' : ''}{row.netTradeSurplus} pts</div>
                </div>
                <div class="card-dim">
                  <div class="dim-label">Draft</div>
                  <div class="rank-badge {rankBadgeClass(row.draftRank, n)} big">#{row.draftRank ?? '—'}</div>
                  <div class="dim-sub">{Math.round(row.draftTotalPts)} pts</div>
                </div>
              </div>
              {#if row.bestDraftPick}
                <div class="card-footer">🏆 Best pick: <strong>{row.bestDraftPick.playerName}</strong> ({Math.round(row.bestDraftPick.starterPts)} pts, {row.bestDraftPick.year})</div>
              {/if}
              {#if row.pendingPickCount > 0}
                <div class="card-pending">⏳ {row.pendingPickCount} pending trade pick(s)</div>
              {/if}
            </div>
          {/each}
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
  .tab-bar { display: flex; border: 1px solid var(--ddd, #ddd); border-radius: 10px; overflow: hidden; margin-bottom: 1.5rem; width: fit-content; }
  .tab-bar button { padding: 0.6rem 1.25rem; border: none; background: var(--fff, #fff); color: var(--g333, #333); cursor: pointer; font-size: 0.9rem; transition: all 0.15s; }
  .tab-bar button.active { background: var(--color-primary, #3498db); color: #fff; }
  .section { animation: fadeIn 0.2s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  h2 { font-size: 1.4rem; margin-bottom: 0.5rem; }
  h3 { font-size: 1rem; margin: 0; }
  h4 { font-size: 0.95rem; margin: 0 0 0.5rem; color: var(--color-primary, #3498db); }
  .note { color: var(--g666, #666); font-size: 0.85rem; margin-bottom: 1rem; line-height: 1.6; }
  .hint { color: var(--g888, #888); font-size: 0.8rem; margin-top: 0.5rem; }
  .table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid var(--ddd, #ddd); margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: var(--eee, #eee); }
  th { padding: 0.75rem 1rem; text-align: left; font-size: 0.85rem; color: var(--g555, #555); cursor: pointer; white-space: nowrap; user-select: none; }
  th:hover { color: var(--color-primary, #3498db); }
  td { padding: 0.65rem 1rem; border-top: 1px solid var(--eee, #eee); font-size: 0.9rem; vertical-align: middle; }
  tr { cursor: pointer; }
  tr:hover td { background: var(--eee, #f9f9f9); }
  .selected-row td { background: rgba(52, 152, 219, 0.07) !important; }
  .expand-row td { padding: 0; border-top: none; cursor: default; }
  .expand-detail { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; padding: 1.25rem 1rem; background: rgba(52, 152, 219, 0.04); border-top: 2px solid rgba(52, 152, 219, 0.18); }
  .detail-col p { margin: 0.3rem 0; font-size: 0.88rem; color: var(--g444, #444); }
  .detail-col p strong { color: var(--g111, #111); }
  .pending-note { color: #9a7000 !important; font-style: italic; }
  .manager-name { font-weight: 700; }
  .rank-badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; }
  .rank-badge.big { font-size: 1.15rem; padding: 0.35rem 0.7rem; }
  .rank-top { background: rgba(46, 204, 113, 0.18); color: #27ae60; }
  .rank-mid { background: rgba(241, 196, 15, 0.18); color: #9a7000; }
  .rank-bot { background: rgba(231, 76, 60, 0.18); color: #e74c3c; }
  .avg-rank-cell { font-weight: 700; }
  .positive { color: #27ae60; font-weight: 600; }
  .negative { color: #e74c3c; font-weight: 600; }
  .pending-badge { background: rgba(241, 196, 15, 0.18); color: #9a7000; border-radius: 10px; padding: 0.15rem 0.5rem; font-size: 0.78rem; font-weight: 700; }
  .radar-wrap { max-width: 700px; margin: 0 auto 2rem; background: var(--fff, #fff); border: 1px solid var(--ddd, #ddd); border-radius: 12px; padding: 1.5rem; }
  .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem; }
  .manager-card { background: var(--fff, #fff); border: 1px solid var(--ddd, #ddd); border-radius: 14px; overflow: hidden; }
  .card-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: var(--eee, #eee); border-bottom: 1px solid var(--ddd, #ddd); }
  .avg-rank-badge { background: var(--color-primary, #3498db); color: #fff; border-radius: 10px; padding: 0.15rem 0.55rem; font-size: 0.78rem; font-weight: 700; }
  .card-dims { display: grid; grid-template-columns: repeat(3, 1fr); padding: 1rem; gap: 0.5rem; }
  .card-dim { text-align: center; }
  .dim-label { font-size: 0.72rem; color: var(--g666, #666); margin-bottom: 0.35rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .dim-sub { font-size: 0.78rem; color: var(--g666, #666); margin-top: 0.35rem; }
  .card-footer { padding: 0.6rem 1.25rem; font-size: 0.82rem; color: var(--g555, #555); border-top: 1px solid var(--eee, #eee); }
  .card-pending { padding: 0.5rem 1.25rem; font-size: 0.82rem; color: #9a7000; background: rgba(241, 196, 15, 0.08); border-top: 1px solid rgba(241, 196, 15, 0.3); }
  @media (max-width: 768px) { .expand-detail { grid-template-columns: 1fr; } .cards-grid { grid-template-columns: 1fr; } }
</style>
