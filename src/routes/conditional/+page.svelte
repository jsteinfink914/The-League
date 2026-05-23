<script>
    import { onMount } from 'svelte';

    let trades = [];
    let selectedTrade = null;
    let loading = true;

    let showForm = false;
    let editingId = null;

    let formDate = '';
    let formParties = '';
    let formPicksRaw = '';
    let formConditions = '';

    let showNameDialog = false;
    let submitterName = '';
    let pendingSubmit = null;

    let showHistoryId = null;
    let confirmDeleteId = null;

    async function loadTrades() {
        const res = await fetch('/api/conditional');
        trades = await res.json();
        loading = false;
    }

    onMount(loadTrades);

    const toggleTrade = (index) => {
        selectedTrade = selectedTrade === index ? null : index;
        showHistoryId = null;
    };

    function openAdd() {
        editingId = null;
        formDate = '';
        formParties = '';
        formPicksRaw = '';
        formConditions = '';
        showForm = true;
        selectedTrade = null;
    }

    function openEdit(e, trade) {
        e.stopPropagation();
        editingId = trade.id;
        formDate = trade.date;
        formParties = trade.parties;
        formPicksRaw = trade.picks.join('\n');
        formConditions = trade.conditions;
        showForm = true;
        selectedTrade = null;
    }

    function cancelForm() {
        showForm = false;
        editingId = null;
    }

    function submitForm() {
        if (!formDate.trim() || !formParties.trim() || !formConditions.trim()) return;
        submitterName = '';
        pendingSubmit = 'form';
        showNameDialog = true;
    }

    async function confirmSubmit() {
        if (!submitterName.trim()) return;
        showNameDialog = false;

        const picks = formPicksRaw.split('\n').map(s => s.trim()).filter(Boolean);
        const payload = {
            date: formDate.trim(),
            parties: formParties.trim(),
            picks,
            conditions: formConditions.trim(),
            submittedBy: submitterName.trim()
        };

        if (editingId) {
            payload.id = editingId;
            await fetch('/api/conditional', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } else {
            await fetch('/api/conditional', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        }

        showForm = false;
        editingId = null;
        pendingSubmit = null;
        await loadTrades();
    }

    function cancelNameDialog() {
        showNameDialog = false;
        pendingSubmit = null;
    }

    function openDelete(e, id) {
        e.stopPropagation();
        confirmDeleteId = id;
    }

    async function confirmDelete() {
        await fetch('/api/conditional', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: confirmDeleteId }) });
        confirmDeleteId = null;
        selectedTrade = null;
        await loadTrades();
    }

    function cancelDelete() {
        confirmDeleteId = null;
    }

    function toggleHistory(e, id) {
        e.stopPropagation();
        showHistoryId = showHistoryId === id ? null : id;
    }

    function formatDate(iso) {
        return new Date(iso).toLocaleString();
    }

    function buildTimeline(trade) {
        const steps = [];

        // Original state: what Jake added. If there were later edits, the first
        // snapshot IS Jake's version. If no edits, the current values are Jake's.
        const originalValues = trade.editHistory.length > 0
            ? trade.editHistory[0].snapshot
            : { date: trade.date, parties: trade.parties, picks: trade.picks, conditions: trade.conditions };

        steps.push({ who: trade.addedBy, when: trade.addedAt, label: 'Created', values: originalValues });

        trade.editHistory.forEach((entry, i) => {
            // What this person changed it TO: the next entry's snapshot, or current if last
            const values = i + 1 < trade.editHistory.length
                ? trade.editHistory[i + 1].snapshot
                : { date: trade.date, parties: trade.parties, picks: trade.picks, conditions: trade.conditions };
            steps.push({ who: entry.editedBy, when: entry.editedAt, label: 'Edited', values });
        });

        return steps;
    }
</script>

<style>
    .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        max-width: 660px;
        margin: 0 auto 18px;
    }

    h2 {
        font-size: 1.5em;
        margin: 0;
    }

    .add-btn {
        background: #1a237e;
        color: #fff;
        border: none;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        font-size: 1.5em;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.2s;
    }

    .add-btn:hover {
        background: #283593;
    }

    .trade-info {
        border: 1px solid #ddd;
        padding: 15px;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        line-height: 1.6;
        max-width: 660px;
        margin: 0 auto;
    }

    .dropdown {
        margin-bottom: 10px;
        cursor: pointer;
        padding: 10px 14px;
        border: 1px solid #ccc;
        border-radius: 5px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .dropdown:hover {
        background: #f5f5f5;
    }

    .dropdown h3 {
        margin: 0;
        font-size: 1.1em;
        flex: 1;
    }

    .edit-btn {
        background: none;
        border: 1px solid #aaa;
        border-radius: 4px;
        padding: 2px 10px;
        font-size: 0.8em;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .edit-btn:hover {
        background: #e8eaf6;
    }

    .delete-btn {
        background: none;
        border: 1px solid #e57373;
        color: #c62828;
        border-radius: 4px;
        padding: 2px 10px;
        font-size: 0.8em;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .delete-btn:hover {
        background: #ffebee;
    }

    .section {
        margin-bottom: 10px;
        text-align: center;
    }

    .section h3 {
        margin: 0 0 5px;
        font-size: 1.1em;
    }

    .section p, .section ul {
        margin: 0;
        font-size: 1em;
    }

    ul {
        padding-left: 20px;
        text-align: left;
    }

    .meta {
        font-size: 0.78em;
        color: #888;
        text-align: center;
        margin-top: 6px;
    }

    .history-toggle {
        background: none;
        border: none;
        color: #1a237e;
        cursor: pointer;
        font-size: 0.78em;
        text-decoration: underline;
        padding: 0;
    }

    .history-box {
        background: #f9f9f9;
        border: 1px solid #eee;
        border-radius: 4px;
        padding: 8px 12px;
        margin-top: 8px;
        font-size: 0.82em;
        text-align: left;
    }

    .history-box h4 {
        margin: 0 0 6px;
        font-size: 0.95em;
    }

    .history-entry {
        border-top: 1px solid #eee;
        padding-top: 8px;
        margin-top: 8px;
    }

    .history-meta {
        margin-bottom: 4px;
    }

    .history-field {
        margin: 2px 0;
        line-height: 1.4;
    }

    .history-key {
        font-weight: bold;
    }

    .timeline-badge {
        display: inline-block;
        font-size: 0.72em;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 2px 8px;
        border-radius: 10px;
        margin-bottom: 4px;
    }

    .badge-created {
        background: #e8f5e9;
        color: #2e7d32;
    }

    .badge-edited {
        background: #e3f2fd;
        color: #1565c0;
    }

    .current-tag {
        display: inline-block;
        font-size: 0.72em;
        background: #fff3e0;
        color: #e65100;
        border-radius: 8px;
        padding: 1px 7px;
        margin-left: 6px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        vertical-align: middle;
    }

    .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.4);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
    }

    .modal {
        background: #fff;
        border-radius: 8px;
        padding: 24px;
        width: 100%;
        max-width: 500px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.18);
    }

    .modal h3 {
        margin: 0 0 16px;
        font-size: 1.2em;
    }

    .field {
        margin-bottom: 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .field label {
        font-size: 0.85em;
        font-weight: bold;
        color: #333;
    }

    .field input,
    .field textarea {
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 7px 10px;
        font-size: 0.95em;
        font-family: inherit;
        resize: vertical;
    }

    .field input:focus,
    .field textarea:focus {
        outline: none;
        border-color: #1a237e;
    }

    .field small {
        font-size: 0.75em;
        color: #888;
    }

    .modal-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 18px;
    }

    .btn-primary {
        background: #1a237e;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 8px 20px;
        cursor: pointer;
        font-size: 0.95em;
    }

    .btn-primary:hover {
        background: #283593;
    }

    .btn-primary:disabled {
        background: #9fa8da;
        cursor: not-allowed;
    }

    .btn-secondary {
        background: none;
        border: 1px solid #aaa;
        border-radius: 4px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 0.95em;
    }

    .btn-secondary:hover {
        background: #f5f5f5;
    }

    .btn-danger {
        background: #c62828;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 8px 20px;
        cursor: pointer;
        font-size: 0.95em;
    }

    .btn-danger:hover {
        background: #b71c1c;
    }

    @media (max-width: 600px) {
        .trade-info {
            padding: 10px;
            font-size: 0.9em;
        }
        h2 { font-size: 1.2em; }
        .dropdown h3 { font-size: 1em; }
        .section h3 { font-size: 1em; }
    }
</style>

<div class="page-header">
    <h2>Conditional Picks</h2>
    <button class="add-btn" on:click={openAdd} title="Add new conditional pick">+</button>
</div>

{#if loading}
    <p style="text-align:center;color:#888;">Loading...</p>
{:else}
<div class="trade-info">
    {#each trades as trade, index}
        <div class="dropdown" on:click={() => toggleTrade(index)}>
            <h3>{trade.parties} — {trade.date}</h3>
            <button class="edit-btn" on:click={(e) => openEdit(e, trade)}>Edit</button>
            <button class="delete-btn" on:click={(e) => openDelete(e, trade.id)}>Delete</button>
        </div>

        {#if selectedTrade === index}
            <div class="section">
                <h3>Date of Trade:</h3>
                <p>{trade.date}</p>
            </div>
            <div class="section">
                <h3>Parties Involved:</h3>
                <p>{trade.parties}</p>
            </div>
            <div class="section">
                <h3>Picks Involved:</h3>
                <p>
                    {#each trade.picks as pick}
                        {pick}<br>
                    {/each}
                </p>
            </div>
            <div class="section">
                <h3>Conditions:</h3>
                <p>{trade.conditions}</p>
            </div>
            <div class="meta">
                Added by <strong>{trade.addedBy}</strong> on {formatDate(trade.addedAt)}
                {#if trade.editHistory.length > 0}
                    &nbsp;·&nbsp;
                    <button class="history-toggle" on:click={(e) => toggleHistory(e, trade.id)}>
                        {showHistoryId === trade.id ? 'Hide' : 'Show'} edit history ({trade.editHistory.length})
                    </button>
                {/if}
            </div>
            {#if showHistoryId === trade.id}
                <div class="history-box">
                    <h4>Full History</h4>
                    {#each buildTimeline(trade) as step, i}
                        <div class="history-entry">
                            <div class="timeline-badge {step.label === 'Created' ? 'badge-created' : 'badge-edited'}">
                                {step.label}
                            </div>
                            <div class="history-meta">
                                <strong>{step.who}</strong> — {formatDate(step.when)}
                                {#if i === buildTimeline(trade).length - 1}<span class="current-tag">current</span>{/if}
                            </div>
                            <div class="history-field"><span class="history-key">Date:</span> {step.values.date}</div>
                            <div class="history-field"><span class="history-key">Parties:</span> {step.values.parties}</div>
                            <div class="history-field"><span class="history-key">Picks:</span> {step.values.picks.join(', ')}</div>
                            <div class="history-field"><span class="history-key">Conditions:</span> {step.values.conditions}</div>
                        </div>
                    {/each}
                </div>
            {/if}
        {/if}
    {/each}

    {#if trades.length === 0}
        <p style="text-align:center;color:#888;">No conditional picks yet. Hit + to add one.</p>
    {/if}
</div>
{/if}

{#if showForm}
<div class="overlay" on:click|self={cancelForm}>
    <div class="modal">
        <h3>{editingId ? 'Edit Conditional Pick' : 'Add Conditional Pick'}</h3>
        <div class="field">
            <label>Date</label>
            <input type="text" bind:value={formDate} placeholder="e.g. 11/1/24" />
        </div>
        <div class="field">
            <label>Parties Involved</label>
            <input type="text" bind:value={formParties} placeholder="e.g. Abul and Coyne" />
        </div>
        <div class="field">
            <label>Picks Involved</label>
            <textarea rows="3" bind:value={formPicksRaw} placeholder="One pick per line"></textarea>
            <small>Enter each pick on its own line</small>
        </div>
        <div class="field">
            <label>Conditions</label>
            <textarea rows="4" bind:value={formConditions} placeholder="Describe the conditions of the deal..."></textarea>
        </div>
        <div class="modal-actions">
            <button class="btn-secondary" on:click={cancelForm}>Cancel</button>
            <button class="btn-primary"
                disabled={!formDate.trim() || !formParties.trim() || !formConditions.trim()}
                on:click={submitForm}>
                {editingId ? 'Save Changes' : 'Add Pick'}
            </button>
        </div>
    </div>
</div>
{/if}

{#if confirmDeleteId}
<div class="overlay" on:click|self={cancelDelete}>
    <div class="modal">
        <h3>Delete this entry?</h3>
        <p style="color:#555;margin:0 0 18px;">This cannot be undone.</p>
        <div class="modal-actions">
            <button class="btn-secondary" on:click={cancelDelete}>Cancel</button>
            <button class="btn-danger" on:click={confirmDelete}>Delete</button>
        </div>
    </div>
</div>
{/if}

{#if showNameDialog}
<div class="overlay" on:click|self={cancelNameDialog}>
    <div class="modal">
        <h3>Who's making this change?</h3>
        <div class="field">
            <label>Your Name</label>
            <input
                type="text"
                bind:value={submitterName}
                placeholder="Enter your name"
                on:keydown={(e) => e.key === 'Enter' && submitterName.trim() && confirmSubmit()}
                autofocus
            />
        </div>
        <div class="modal-actions">
            <button class="btn-secondary" on:click={cancelNameDialog}>Cancel</button>
            <button class="btn-primary" disabled={!submitterName.trim()} on:click={confirmSubmit}>
                Confirm
            </button>
        </div>
    </div>
</div>
{/if}
