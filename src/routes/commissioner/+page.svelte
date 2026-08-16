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
    fetchLog = 'Opening FantasyPros auction calculator…';
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
      if (data.ok) await loadState();
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
      if (data.ok) rookiesDirty = false;
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
      if (data.ok) await loadState();
    } catch (e) {
      generateLog = e.message;
      generateOk = false;
    } finally {
      generateRunning = false;
    }
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
  .page {
    max-width: 860px;
    margin: 2rem auto;
    padding: 0 1.5rem 4rem;
    font-family: inherit;
    color: var(--g333, #333);
  }

  h1 {
    font-size: 1.6rem;
    font-weight: 700;
    border-bottom: 2px solid #920505;
    padding-bottom: .5rem;
    margin-bottom: 2rem;
  }

  .card {
    background: #fff;
    border: 1px solid #e0e0e0;
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
  }

  .meta {
    font-size: .8rem;
    color: #888;
    margin: 0 0 1rem;
  }

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
  }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary { background: #920505; color: #fff; }
  .btn-secondary { background: #f0f0f0; color: #333; border: 1px solid #ccc; }
  .btn-success { background: #2d7a2d; color: #fff; }

  .log {
    background: #1e1e1e;
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
  }

  .status-ok   { color: #2d7a2d; font-weight: 600; font-size: .85rem; }
  .status-err  { color: #920505; font-weight: 600; font-size: .85rem; }
  .status-info { color: #555;    font-size: .85rem; }

  table.review {
    width: 100%;
    border-collapse: collapse;
    font-size: .85rem;
  }
  table.review th {
    text-align: left;
    padding: .4rem .6rem;
    border-bottom: 2px solid #e0e0e0;
    color: #555;
    font-weight: 600;
  }
  table.review td {
    padding: .35rem .6rem;
    border-bottom: 1px solid #f0f0f0;
  }
  table.review tr:hover td { background: #fafafa; }
  table.review input[type=number] {
    width: 70px;
    padding: .25rem .4rem;
    border: 1px solid #ccc;
    border-radius: 3px;
    font-size: .85rem;
  }

  .pill {
    display: inline-block;
    padding: .15rem .5rem;
    border-radius: 12px;
    font-size: .75rem;
    font-weight: 600;
  }
  .pill-ok  { background: #e8f5e9; color: #2d7a2d; }
  .pill-warn { background: #fff3e0; color: #c55a00; }
  .pill-err  { background: #fdecea; color: #920505; }

  .issue-table { font-size: .8rem; }
  .issue-table td { vertical-align: top; }

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
      {#if state.rookiesReview.mtime}· last updated {fmt(state.rookiesReview.mtime)}{/if}
    </p>

    {#if rookieRows.length === 0}
      <p class="status-info">No rookies in the review file yet. Run <strong>Refresh</strong> first (with Sleeper auto-detection).</p>
    {:else}
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
    {:else if state.auditIssues.exists}
      <p class="status-ok" style="margin-top:.75rem">✓ No roster issues found</p>
    {/if}
  </div>

  {/if}<!-- end loading -->
</div>
