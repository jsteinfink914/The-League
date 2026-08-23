<script>
  import { onMount } from 'svelte';

  const YEAR = 2026;

  // ── state ──────────────────────────────────────────────────────────────────
  let loading = true;
  let state = null;
  let error = null;

  // per-step
  let fetchRunning = false;
  let fetchLog = '';
  let fetchOk = null;

  let rookieRows = [];
  let rookiesDirty = false;
  let saveRunning = false;
  let saveOk = null;

  let generateRunning = false;
  let generateLog = '';
  let generateOk = null;

  let auditRunning = false;
  let auditLog = '';
  let auditIssues = [];

  // ── lifecycle ──────────────────────────────────────────────────────────────
  onMount(loadState);

  async function loadState() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/commissioner/state');
      state = await res.json();
      rookieRows = state.rookiesReview.rows.map((r) => ({ ...r }));
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // ── step 1 – fetch ─────────────────────────────────────────────────────────
  async function runFetch() {
    fetchRunning = true;
    fetchLog = 'Opening FantasyPros auction calculator… (then rebuilding rookie list from Sleeper)';
    fetchOk = null;
    try {
      const res = await fetch('/api/commissioner/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: YEAR })
      });
      const data = await res.json();
      fetchLog = data.output || data.error || '(no output)';
      fetchOk = data.ok;
      if (data.ok) {
        await loadState();
        await refreshDiff();
      }
    } catch (e) {
      fetchLog = e.message;
      fetchOk = false;
    } finally {
      fetchRunning = false;
    }
  }

  // ── step 2 – rookie review edits ───────────────────────────────────────────
  function markDirty() {
    rookiesDirty = true;
    saveOk = null;
  }

  async function saveRookies() {
    saveRunning = true;
    saveOk = null;
    try {
      const res = await fetch('/api/commissioner/rookies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: YEAR, rows: rookieRows })
      });
      const data = await res.json();
      saveOk = data.ok;
      if (data.ok) {
        rookiesDirty = false;
        await refreshDiff();
      }
    } catch {
      saveOk = false;
    } finally {
      saveRunning = false;
    }
  }

  // ── step 3 – generate ─────────────────────────────────────────────────────
  async function runGenerate() {
    if (rookiesDirty) {
      alert('Save your rookie edits before generating.');
      return;
    }
    generateRunning = true;
    generateLog = '';
    generateOk = null;
    try {
      const res = await fetch('/api/commissioner/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: YEAR })
      });
      const data = await res.json();
      generateLog = data.output || data.error || '(no output)';
      generateOk = data.ok;
      if (data.ok) {
        await loadState();
        await refreshDiff();
      }
    } catch (e) {
      generateLog = e.message;
      generateOk = false;
    } finally {
      generateRunning = false;
    }
  }

  // ── diff viewer ───────────────────────────────────────────────────────────
  let diffOpen = false;
  let diffLoading = false;
  let diffData = null;
  let diffError = null;

  async function toggleDiff() {
    diffOpen = !diffOpen;
    if (diffOpen && !diffData) await loadDiff();
  }

  async function loadDiff() {
    diffLoading = true;
    diffError = null;
    try {
      const res = await fetch(`/api/commissioner/diff?year=${YEAR}`);
      const data = await res.json();
      if (data.ok) diffData = data;
      else diffError = data.error || 'Unknown error';
    } catch (e) {
      diffError = e.message;
    } finally {
      diffLoading = false;
    }
  }

  async function refreshDiff() {
    diffData = null;
    if (diffOpen) await loadDiff();
  }

  // ── step 4 – audit ────────────────────────────────────────────────────────
  async function runAudit() {
    auditRunning = true;
    auditLog = '';
    auditIssues = [];
    try {
      const res = await fetch('/api/commissioner/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: YEAR })
      });
      const data = await res.json();
      auditLog = data.output || '(no output)';
      auditIssues = state?.auditIssues?.rows ?? [];
      await loadState();
      auditIssues = state?.auditIssues?.rows ?? [];
    } catch (e) {
      auditLog = e.message;
    } finally {
      auditRunning = false;
    }
  }

  function fmt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }
</script>

<style>
  /* ── Layout ─────────────────────────────────────────────────── */
  .page {
    max-width: 860px;
    margin: 2rem auto;
    padding: 0 1.5rem 4rem;
    font-family: inherit;
    color: var(--g333);
  }

  h1 {
    font-size: 1.6rem;
    font-weight: 700;
    border-bottom: 2px solid #920505;
    padding-bottom: .5rem;
    margin-bottom: 2rem;
    color: var(--g333);
  }

  .card {
    background: var(--fff);
    border: 1px solid var(--ddd);
    border-radius: 6px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.5rem;
  }

  .card-header {
    display: flex;
    align-items: baseline;
    gap: .75rem;
    margin-bottom: 1rem;
  }

  .step-badge {
    background: #920505;
    color: #fff;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    line-height: 24px;
    text-align: center;
    font-size: .75rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  h2 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
    color: var(--g333);
  }

  .meta {
    font-size: .8rem;
    color: var(--g999);
    margin: 0 0 1rem;
  }

  /* ── Code ───────────────────────────────────────────────────── */
  code {
    font-size: .82em;
    background: var(--f3f3f3);
    color: var(--g333);
    border-radius: 3px;
    padding: .1em .35em;
    word-break: break-all;
  }

  /* ── Buttons ─────────────────────────────────────────────────── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    padding: .5rem 1.1rem;
    border: none;
    border-radius: 4px;
    font-size: .875rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity .15s;
    white-space: nowrap;
  }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary  { background: #920505; color: #fff; }
  .btn-secondary {
    background: var(--eee);
    color: var(--g333);
    border: 1px solid var(--ccc);
  }
  .btn-success  { background: #2d7a2d; color: #fff; }

  /* ── Log output ─────────────────────────────────────────────── */
  .log {
    background: #111;
    color: #d4d4d4;
    font-family: monospace;
    font-size: .75rem;
    border-radius: 4px;
    padding: .75rem 1rem;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 220px;
    overflow-y: auto;
    margin-top: .75rem;
    border: 1px solid var(--ddd);
  }

  /* ── Status text ─────────────────────────────────────────────── */
  .status-ok   { color: #3a9c3a; font-weight: 600; font-size: .85rem; }
  .status-err  { color: #c0392b; font-weight: 600; font-size: .85rem; }
  .status-info { color: var(--g555); font-size: .85rem; }

  /* ── Tables ─────────────────────────────────────────────────── */
  .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-top: .25rem;
  }

  table.review {
    width: 100%;
    border-collapse: collapse;
    font-size: .85rem;
    min-width: 380px;
  }
  table.review th {
    text-align: left;
    padding: .4rem .6rem;
    border-bottom: 2px solid var(--ddd);
    color: var(--g555);
    font-weight: 600;
    white-space: nowrap;
    background: var(--fff);
  }
  table.review td {
    padding: .35rem .6rem;
    border-bottom: 1px solid var(--eee);
    color: var(--g333);
  }
  table.review tr:hover td { background: var(--f8f8f8); }
  table.review input[type=number] {
    width: 70px;
    padding: .25rem .4rem;
    border: 1px solid var(--ccc);
    border-radius: 3px;
    font-size: .85rem;
    background: var(--fff);
    color: var(--g333);
  }

  /* ── Pills — rgba so they work in both light & dark ─────────── */
  .pill {
    display: inline-block;
    padding: .15rem .5rem;
    border-radius: 12px;
    font-size: .75rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .pill-ok   { background: rgba(45, 122, 45,  .15); color: #3a9c3a; }
  .pill-warn { background: rgba(197, 90,  0,  .15); color: #c55a00; }
  .pill-err  { background: rgba(146,   5,  5, .15); color: #c0392b; }

  .issue-table { font-size: .8rem; }
  .issue-table td { vertical-align: top; }

  /* ── Spinner ─────────────────────────────────────────────────── */
  .spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .save-row {
    display: flex;
    align-items: center;
    gap: .75rem;
    margin-top: .75rem;
    flex-wrap: wrap;
  }

  /* ── Diff viewer ────────────────────────────────────────────── */
  .diff-toggle {
    display: flex;
    align-items: center;
    gap: .5rem;
    background: none;
    border: 1px solid var(--ccc);
    border-radius: 4px;
    padding: .4rem .9rem;
    font-size: .875rem;
    font-weight: 600;
    color: var(--g333);
    cursor: pointer;
    transition: background .15s;
  }
  .diff-toggle:hover { background: var(--f3f3f3); }

  .diff-section { margin-top: 1.25rem; }

  .diff-refresh {
    float: right;
    border: 0;
    background: none;
    color: var(--g555);
    font-size: .75rem;
    cursor: pointer;
    padding: .15rem 0;
  }
  .diff-refresh:hover { color: var(--g333); text-decoration: underline; }
  .diff-refresh:disabled { cursor: wait; opacity: .6; }

  .diff-heading {
    font-size: .9rem;
    font-weight: 700;
    color: var(--g333);
    margin: .25rem 0 .35rem;
  }

  .diff-divider {
    border-top: 1px solid var(--ddd);
    margin: 1.5rem 0 1rem;
    clear: both;
  }

  .diff-group-label {
    font-size: .75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--g999);
    margin: 1rem 0 .35rem;
  }

  .delta-pos { color: #3a9c3a; font-weight: 700; }
  .delta-neg { color: #c0392b; font-weight: 700; }
  .delta-zero { color: var(--g999); }

  .diff-empty {
    font-size: .875rem;
    color: var(--g555);
    padding: .5rem 0;
  }

  /* ── Mobile ─────────────────────────────────────────────────── */
  @media (max-width: 600px) {
    .page    { padding: 0 .75rem 3rem; margin: 1rem auto; }
    h1       { font-size: 1.2rem; }
    .card    { padding: .9rem 1rem; }
    .btn     { font-size: .8rem; padding: .45rem .85rem; }
    table.review         { font-size: .78rem; }
    table.review th,
    table.review td      { padding: .28rem .4rem; }
  }
</style>

<div class="page">
  <h1>⚙ Commissioner — Value Refresh {YEAR}</h1>

  {#if loading}
    <p class="status-info">Loading state…</p>
  {:else if error}
    <p class="status-err">Error loading state: {error}</p>
  {:else}

  <!-- ─── STEP 1: FETCH ──────────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-header">
      <div class="step-badge">1</div>
      <h2>Refresh from FantasyPros</h2>
    </div>
    <p class="meta">
      Current input: {state.fpRaw.exists
        ? `${state.fpRaw.rowCount} rows  ·  last fetched ${fmt(state.fpRaw.mtime)}`
        : 'no file yet'}
    </p>
    <p class="meta" style="color:#555; font-size:.82rem;">
      Opens FantasyPros in a headless browser, selects <strong>Half PPR · 16 Teams · $500 Budget · Overall Rankings</strong>,
      clicks Calculate, verifies the settings, then replaces
      <code>data/player-values/raw/fantasypros-{YEAR}.csv</code> only if the result is complete (&ge;200 rows).
      Takes ~60 seconds.
    </p>

    <button class="btn btn-primary" on:click={runFetch} disabled={fetchRunning}>
      {#if fetchRunning}<span class="spinner" />{/if}
      {fetchRunning ? 'Fetching…' : 'Refresh Values from FantasyPros'}
    </button>

    {#if fetchLog}
      <div class="log">{fetchLog}</div>
      <p class="save-row" style="margin-top:.5rem">
        {#if fetchOk === true}<span class="status-ok">✓ Fetch succeeded</span>
        {:else if fetchOk === false}<span class="status-err">✗ Fetch failed — existing file unchanged</span>
        {/if}
      </p>
    {/if}
  </div>

  <!-- ─── STEP 2: ROOKIE REVIEW ──────────────────────────────────────────── -->
  <div class="card">
    <div class="card-header">
      <div class="step-badge">2</div>
      <h2>Rookie Review</h2>
    </div>
    <p class="meta">
      {rookieRows.length} rookie{rookieRows.length === 1 ? '' : 's'} detected
      {#if state.rookiesReview.mtime}· last generated {fmt(state.rookiesReview.mtime)}{/if}
    </p>

    {#if rookieRows.length === 0}
      <p class="status-info">No rookies found yet — run <strong>Generate</strong> (step 3) to populate this list.</p>
    {:else}
      <div class="table-wrap">
      <table class="review">
        <thead>
          <tr>
            <th>FantasyPros Name</th>
            <th>Rookie Value ($)</th>
            <th>Sleeper Name</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {#each rookieRows as row, i}
            <tr>
              <td>{row.Fantasy_Pros}</td>
              <td>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  bind:value={rookieRows[i].RookieValue}
                  on:input={markDirty}
                />
              </td>
              <td>{row.Sleeper || '—'}</td>
              <td><span class="pill {row.Source?.includes('mapping') ? 'pill-warn' : 'pill-ok'}">{row.Source || '—'}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
      </div>

      <div class="save-row">
        <button
          class="btn btn-secondary"
          on:click={saveRookies}
          disabled={!rookiesDirty || saveRunning}
        >
          {saveRunning ? 'Saving…' : 'Save Edits'}
        </button>
        {#if saveOk === true}<span class="status-ok">✓ Saved</span>
        {:else if saveOk === false}<span class="status-err">✗ Save failed</span>
        {:else if rookiesDirty}<span class="status-info">Unsaved changes</span>
        {/if}
      </div>
    {/if}

    {#if state.unmatchedRookies.rows.length > 0}
      <details style="margin-top:1rem">
        <summary style="cursor:pointer; font-size:.85rem; color:#555;">
          {state.unmatchedRookies.rows.length} unmatched rookie candidates (add to fp_sleeper_mapping.txt if needed)
        </summary>
        <div class="table-wrap">
        <table class="review issue-table" style="margin-top:.5rem">
          <thead><tr><th>Sleeper</th><th>Suggested FP Name</th><th>Suggested Value</th><th>Confidence</th></tr></thead>
          <tbody>
            {#each state.unmatchedRookies.rows as r}
              <tr>
                <td>{r.Sleeper}</td>
                <td>{r.Suggested_Fantasy_Pros || '—'}</td>
                <td>{r.Suggested_Value || '—'}</td>
                <td>{r.Confidence || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        </div>
      </details>
    {/if}
  </div>

  <!-- ─── STEP 3: GENERATE ───────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-header">
      <div class="step-badge">3</div>
      <h2>Generate Player Values</h2>
    </div>
    <p class="meta">
      Rebuilds <code>static/Player_Values.txt</code> from the FantasyPros input + rookie review.
      {#if state.playerValues.mtime}Last generated: {fmt(state.playerValues.mtime)}.{/if}
    </p>

    {#if rookiesDirty}
      <p class="status-info" style="margin-bottom:.75rem">⚠ Save your rookie edits before generating.</p>
    {/if}

    <button
      class="btn btn-primary"
      on:click={runGenerate}
      disabled={generateRunning || !state.fpRaw.exists || rookiesDirty}
    >
      {#if generateRunning}<span class="spinner" />{/if}
      {generateRunning ? 'Generating…' : 'Generate Player Values'}
    </button>

    {#if generateLog}
      <div class="log">{generateLog}</div>
      <p class="save-row" style="margin-top:.5rem">
        {#if generateOk === true}<span class="status-ok">✓ Player_Values.txt updated</span>
        {:else if generateOk === false}<span class="status-err">✗ Generation failed</span>
        {/if}
      </p>
    {/if}
  </div>

  <!-- ─── STEP 4: AUDIT ──────────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-header">
      <div class="step-badge">4</div>
      <h2>Roster Audit</h2>
    </div>
    <p class="meta">
      Checks every rostered player against the generated values and flags name mismatches.
      Run this after generating to confirm nothing was missed.
    </p>

    <button
      class="btn btn-primary"
      on:click={runAudit}
      disabled={auditRunning || !state.playerValues.exists}
    >
      {#if auditRunning}<span class="spinner" />{/if}
      {auditRunning ? 'Auditing…' : 'Run Roster Audit'}
    </button>

    {#if auditLog}
      <div class="log">{auditLog}</div>
    {/if}

    {#if state.auditIssues.rows.length > 0}
      <p style="margin-top:.75rem">
        <span class="pill pill-warn">{state.auditIssues.rows.length} issue{state.auditIssues.rows.length === 1 ? '' : 's'} flagged</span>
        — add missing rows to <code>static/fp_sleeper_mapping.txt</code> then re-generate.
      </p>
      <div class="table-wrap">
      <table class="review issue-table" style="margin-top:.5rem">
        <thead>
          <tr>
            <th>Sleeper Name</th>
            <th>Suggested FP</th>
            <th>Suggested Value</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {#each state.auditIssues.rows as r}
            <tr>
              <td>{r.Sleeper}</td>
              <td>{r.Suggested_Fantasy_Pros || '—'}</td>
              <td>{r.Suggested_Value || '—'}</td>
              <td>{r.Notes}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      </div>
    {:else if state.auditIssues.exists}
      <p class="status-ok" style="margin-top:.75rem">✓ No roster issues found</p>
    {/if}
  </div>

  <!-- ─── PENDING CHANGES ────────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-header">
      <div class="step-badge" style="background:var(--g555)">↕</div>
      <h2>Review Pending Changes</h2>
    </div>
    <p class="meta">Compare the generated player values and rookie review against the last committed version before pushing.</p>

    <button class="diff-toggle" on:click={toggleDiff}>
      {diffOpen ? '▲ Hide changes' : '▼ Review changes vs last commit'}
    </button>

    {#if diffOpen}
      <div class="diff-section">
        <button class="diff-refresh" on:click={loadDiff} disabled={diffLoading}>↻ Refresh comparison</button>
        {#if diffLoading}
          <p class="status-info">Loading diff…</p>
        {:else if diffError}
          <p class="status-err">✗ {diffError}</p>
        {:else if diffData}
          {@const valueTotal = diffData.values.changed.length + diffData.values.added.length + diffData.values.removed.length}
          {@const rookieTotal = diffData.rookies.changed.length + diffData.rookies.added.length + diffData.rookies.removed.length}
          {@const total = valueTotal + rookieTotal}
          {#if total === 0}
            <p class="diff-empty">✓ No changes from last commit — nothing new to push.</p>
          {:else}

            <p class="diff-heading">Generated player values <span class="pill pill-ok">{valueTotal} change{valueTotal === 1 ? '' : 's'}</span></p>
            {#if valueTotal === 0}
              <p class="diff-empty">No generated player-value changes yet. Run Generate after reviewing rookies.</p>
            {/if}

            {#if diffData.values.changed.length > 0}
              <p class="diff-group-label">Changed ({diffData.values.changed.length})</p>
              <div class="table-wrap">
              <table class="review issue-table">
                <thead><tr><th>Player</th><th>Was</th><th>Now</th><th>Δ</th></tr></thead>
                <tbody>
                  {#each diffData.values.changed as r}
                    <tr>
                      <td>{r.name}{#if r.rookie} <span class="pill pill-ok" style="font-size:.65rem">R</span>{/if}</td>
                      <td>${r.oldValue}</td>
                      <td>${r.newValue}</td>
                      <td class="{r.delta > 0 ? 'delta-pos' : r.delta < 0 ? 'delta-neg' : 'delta-zero'}">
                        {r.delta > 0 ? '+' : ''}{r.delta}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              </div>
            {/if}

            {#if diffData.values.added.length > 0}
              <p class="diff-group-label">Added ({diffData.values.added.length})</p>
              <div class="table-wrap">
              <table class="review issue-table">
                <thead><tr><th>Player</th><th>Value</th></tr></thead>
                <tbody>
                  {#each diffData.values.added as r}
                    <tr>
                      <td>{r.name}{#if r.rookie} <span class="pill pill-ok" style="font-size:.65rem">R</span>{/if}</td>
                      <td class="delta-pos">${r.value}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              </div>
            {/if}

            {#if diffData.values.removed.length > 0}
              <p class="diff-group-label">Removed ({diffData.values.removed.length})</p>
              <div class="table-wrap">
              <table class="review issue-table">
                <thead><tr><th>Player</th><th>Was</th></tr></thead>
                <tbody>
                  {#each diffData.values.removed as r}
                    <tr>
                      <td>{r.name}</td>
                      <td class="delta-neg">${r.value}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              </div>
            {/if}

            <div class="diff-divider"></div>
            <p class="diff-heading">Rookie review <span class="pill pill-warn">{rookieTotal} pending change{rookieTotal === 1 ? '' : 's'}</span></p>
            <p class="meta">These changes become part of <code>Player_Values.txt</code> when you run Generate.</p>

            {#if rookieTotal === 0}
              <p class="diff-empty">No rookie review changes.</p>
            {/if}

            {#if diffData.rookies.changed.length > 0}
              <p class="diff-group-label">Changed ({diffData.rookies.changed.length})</p>
              <div class="table-wrap">
              <table class="review issue-table">
                <thead><tr><th>Rookie</th><th>Was</th><th>Now</th><th>Δ</th></tr></thead>
                <tbody>
                  {#each diffData.rookies.changed as r}
                    <tr>
                      <td>{r.name}</td>
                      <td>${r.oldValue}</td>
                      <td>${r.newValue}</td>
                      <td class="{r.delta > 0 ? 'delta-pos' : r.delta < 0 ? 'delta-neg' : 'delta-zero'}">
                        {r.delta > 0 ? '+' : ''}{r.delta}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              </div>
            {/if}

            {#if diffData.rookies.added.length > 0}
              <p class="diff-group-label">Added ({diffData.rookies.added.length})</p>
              <div class="table-wrap">
              <table class="review issue-table">
                <thead><tr><th>Rookie</th><th>Value</th></tr></thead>
                <tbody>
                  {#each diffData.rookies.added as r}
                    <tr><td>{r.name}</td><td class="delta-pos">${r.value}</td></tr>
                  {/each}
                </tbody>
              </table>
              </div>
            {/if}

            {#if diffData.rookies.removed.length > 0}
              <p class="diff-group-label">Removed ({diffData.rookies.removed.length})</p>
              <div class="table-wrap">
              <table class="review issue-table">
                <thead><tr><th>Rookie</th><th>Was</th></tr></thead>
                <tbody>
                  {#each diffData.rookies.removed as r}
                    <tr><td>{r.name}</td><td class="delta-neg">${r.value}</td></tr>
                  {/each}
                </tbody>
              </table>
              </div>
            {/if}
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  {/if}<!-- end loading -->
</div>
