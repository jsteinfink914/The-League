<script>
    import { onMount } from 'svelte';

    let records = [];
    let loading = true;
    let loadError = null;

    async function load() {
        try {
            const res = await fetch('/api/rule-violations');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            records = Array.isArray(data) ? data : [];
        } catch (e) {
            loadError = e.message;
        } finally {
            loading = false;
        }
    }

    onMount(load);

    const active = () => records.filter((r) => r.status === 'active');
    const history = () => records.filter((r) => r.status !== 'active');

    const ruleLabel = (r) => (r.rule === 'cap' ? 'Salary cap' : 'Rule 8 — QB/K/DEF limit');
    const statusLabel = (r) => (r.status === 'active' ? 'Active' : r.status === 'charged' ? 'Charged' : 'Resolved');
    const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<style>
    .wrap {
        max-width: 660px;
        margin: 0 auto;
        font-family: Arial, sans-serif;
        line-height: 1.6;
    }

    h2 {
        font-size: 1.5em;
        margin: 0 0 6px;
        text-align: center;
    }

    .explainer {
        text-align: center;
        color: var(--g555);
        font-size: 0.92em;
        margin: 0 0 20px;
    }

    h3.section-title {
        font-size: 1.05em;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--g333);
        border-bottom: 2px solid var(--ddd);
        padding-bottom: 4px;
        margin: 22px 0 12px;
    }

    .card {
        border: 1px solid var(--ccc);
        border-left: 5px solid #c62828;
        border-radius: 5px;
        padding: 12px 16px;
        margin-bottom: 10px;
    }

    .card.charged {
        border-left-color: #b7791f;
    }

    .card.resolved {
        border-left-color: var(--aaa);
        opacity: 0.75;
    }

    .card-top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
    }

    .manager {
        font-size: 1.15em;
        font-weight: bold;
    }

    .badge {
        display: inline-block;
        font-size: 0.7em;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 2px 8px;
        border-radius: 10px;
        background: rgba(198, 40, 40, 0.12);
        color: #c62828;
        white-space: nowrap;
    }

    .badge.charged {
        background: rgba(183, 121, 31, 0.14);
        color: #b7791f;
    }

    .badge.resolved {
        background: var(--eee);
        color: var(--g555);
    }

    .rule-line {
        font-size: 0.8em;
        color: var(--g999);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-top: 2px;
    }

    .headline {
        margin-top: 6px;
        font-size: 1em;
    }

    .detail {
        margin-top: 4px;
        font-size: 0.9em;
        color: var(--g555);
    }

    .dates {
        margin-top: 6px;
        font-size: 0.78em;
        color: var(--g999);
    }

    .empty {
        text-align: center;
        color: var(--g999);
        padding: 24px 0;
    }

    @media (max-width: 600px) {
        h2 { font-size: 1.2em; }
        .card { padding: 10px 12px; }
    }
</style>

<div class="wrap">
    <h2>Rule Violations</h2>
    <p class="explainer">
        The league's rap sheet, tracked automatically by the nightly watcher since Nov 10, 2026.
        Cap charges are final only once a team has played a week still over the $600 cap.
        Rule 8 caps QB + K + DEF at 5 active roster spots combined — players on IR and the taxi squad don't count.
    </p>

    {#if loading}
        <p class="empty">Loading...</p>
    {:else if loadError}
        <p class="empty" style="color:#c62828;">Error loading violations: {loadError}</p>
    {:else if records.length === 0}
        <p class="empty">No violations on record. Clean league — for now.</p>
    {:else}
        {#if active().length}
            <h3 class="section-title">Active now</h3>
            {#each active() as r}
                <div class="card">
                    <div class="card-top">
                        <span class="manager">{r.manager}</span>
                        <span class="badge">{statusLabel(r)}</span>
                    </div>
                    <div class="rule-line">{ruleLabel(r)}</div>
                    <div class="headline">{r.headline}</div>
                    {#if r.detail}<div class="detail">{r.detail}</div>{/if}
                    <div class="dates">First flagged {fmtDate(r.firstSeen)}</div>
                </div>
            {/each}
        {/if}

        {#if history().length}
            <h3 class="section-title">The record</h3>
            {#each history() as r}
                <div class="card {r.status}">
                    <div class="card-top">
                        <span class="manager">{r.manager}</span>
                        <span class="badge {r.status}">{statusLabel(r)}</span>
                    </div>
                    <div class="rule-line">{ruleLabel(r)}</div>
                    <div class="headline">{r.headline}</div>
                    {#if r.detail}<div class="detail">{r.detail}</div>{/if}
                    <div class="dates">
                        Flagged {fmtDate(r.firstSeen)}
                        {#if r.resolvedAt} · Resolved {fmtDate(r.resolvedAt)}{/if}
                    </div>
                </div>
            {/each}
        {/if}
    {/if}
</div>
