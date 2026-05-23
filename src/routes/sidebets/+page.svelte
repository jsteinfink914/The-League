<script>
    import { onMount } from 'svelte';

    let bets = [];
    let selectedBet = null;
    let loading = true;
    let loadError = null;

    let showForm = false;
    let editingId = null;

    let formDate = '';
    let formParties = '';
    let formBet = '';

    let showNameDialog = false;
    let submitterName = '';
    let pendingSubmit = null;

    let showHistoryId = null;
    let confirmDeleteId = null;

    async function loadBets() {
        try {
            const res = await fetch('/api/sidebets');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            bets = Array.isArray(data) ? data : [];
        } catch (e) {
            loadError = e.message;
        } finally {
            loading = false;
        }
    }

    onMount(loadBets);

    const toggleBet = (index) => {
        selectedBet = selectedBet === index ? null : index;
        showHistoryId = null;
    };

    function openAdd() {
        editingId = null;
        formDate = '';
        formParties = '';
        formBet = '';
        showForm = true;
        selectedBet = null;
    }

    function openEdit(e, bet) {
        e.stopPropagation();
        editingId = bet.id;
        formDate = bet.date;
        formParties = bet.parties;
        formBet = bet.bet;
        showForm = true;
        selectedBet = null;
    }

    function cancelForm() {
        showForm = false;
        editingId = null;
    }

    function submitForm() {
        if (!formDate.trim() || !formParties.trim() || !formBet.trim()) return;
        submitterName = '';
        pendingSubmit = 'form';
        showNameDialog = true;
    }

    async function confirmSubmit() {
        if (!submitterName.trim()) return;
        showNameDialog = false;

        const payload = {
            date: formDate.trim(),
            parties: formParties.trim(),
            bet: formBet.trim(),
            submittedBy: submitterName.trim()
        };

        if (editingId) {
            payload.id = editingId;
            await fetch('/api/sidebets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } else {
            await fetch('/api/sidebets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        }

        showForm = false;
        editingId = null;
        pendingSubmit = null;
        await loadBets();
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
        await fetch('/api/sidebets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: confirmDeleteId }) });
        confirmDeleteId = null;
        selectedBet = null;
        await loadBets();
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

    function buildTimeline(bet) {
        const steps = [];

        const originalValues = bet.editHistory.length > 0
            ? bet.editHistory[0].snapshot
            : { date: bet.date, parties: bet.parties, bet: bet.bet };

        steps.push({ who: bet.addedBy, when: bet.addedAt, label: 'Created', values: originalValues });

        bet.editHistory.forEach((entry, i) => {
            const values = i + 1 < bet.editHistory.length
                ? bet.editHistory[i + 1].snapshot
                : { date: bet.date, parties: bet.parties, bet: bet.bet };
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
        background: var(--blueOne);
        color: var(--fff);
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
        background: var(--blueTwo);
    }

    .bets-container {
        border: 1px solid var(--ddd);
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
        border: 1px solid var(--ccc);
        border-radius: 5px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .dropdown:hover {
        background: var(--f8f8f8);
    }

    .dropdown h3 {
        margin: 0;
        font-size: 1.1em;
        flex: 1;
    }

    .edit-btn {
        background: none;
        border: 1px solid var(--aaa);
        border-radius: 4px;
        padding: 2px 10px;
        font-size: 0.8em;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .edit-btn:hover {
        background: var(--eee);
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
        background: rgba(198, 40, 40, 0.12);
    }

    .section {
        margin-bottom: 10px;
        text-align: center;
    }

    .section h3 {
        margin: 0 0 5px;
        font-size: 1.1em;
    }

    .section p {
        margin: 0;
        font-size: 1em;
    }

    .meta {
        font-size: 0.78em;
        color: var(--g999);
        text-align: center;
        margin-top: 6px;
    }

    .history-toggle {
        background: none;
        border: none;
        color: var(--blueOne);
        cursor: pointer;
        font-size: 0.78em;
        text-decoration: underline;
        padding: 0;
    }

    .history-box {
        background: var(--f3f3f3);
        border: 1px solid var(--eee);
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
        border-top: 1px solid var(--eee);
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
        background: var(--badgeRookieYearBg);
        color: var(--badgeRookieYearText);
    }

    .badge-edited {
        background: var(--badgeRookieY12Bg);
        color: var(--badgeRookieY12Text);
    }

    .current-tag {
        display: inline-block;
        font-size: 0.72em;
        background: var(--badgeRookieY3Bg);
        color: var(--badgeRookieY3Text);
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
        background: rgba(0,0,0,0.5);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
    }

    .modal {
        background: var(--fff);
        border: 1px solid var(--ddd);
        border-radius: 8px;
        padding: 24px;
        width: 100%;
        max-width: 500px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.3);
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
        color: var(--g333);
    }

    .field input,
    .field textarea {
        background: var(--fff);
        color: var(--g000);
        border: 1px solid var(--ccc);
        border-radius: 4px;
        padding: 7px 10px;
        font-size: 0.95em;
        font-family: inherit;
        resize: vertical;
    }

    .field input:focus,
    .field textarea:focus {
        outline: none;
        border-color: var(--blueOne);
    }

    .modal-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 18px;
    }

    .btn-primary {
        background: var(--blueOne);
        color: var(--fff);
        border: none;
        border-radius: 4px;
        padding: 8px 20px;
        cursor: pointer;
        font-size: 0.95em;
    }

    .btn-primary:hover {
        background: var(--blueTwo);
    }

    .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-secondary {
        background: none;
        border: 1px solid var(--aaa);
        border-radius: 4px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 0.95em;
    }

    .btn-secondary:hover {
        background: var(--f8f8f8);
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
        .bets-container {
            padding: 10px;
            font-size: 0.9em;
        }
        h2 { font-size: 1.2em; }
        .dropdown h3 { font-size: 1em; }
        .section h3 { font-size: 1em; }
    }
</style>

<div class="page-header">
    <h2>Side Bets</h2>
    <button class="add-btn" on:click={openAdd} title="Add new side bet">+</button>
</div>

{#if loading}
    <p style="text-align:center;color:var(--g999);">Loading...</p>
{:else if loadError}
    <p style="text-align:center;color:#c62828;padding:20px;">Error loading bets: {loadError}</p>
{:else}
<div class="bets-container">
    {#each bets as bet, index}
        <div class="dropdown" on:click={() => toggleBet(index)}>
            <h3>{bet.parties} — {bet.date}</h3>
            <button class="edit-btn" on:click={(e) => openEdit(e, bet)}>Edit</button>
            <button class="delete-btn" on:click={(e) => openDelete(e, bet.id)}>Delete</button>
        </div>

        {#if selectedBet === index}
            <div class="section">
                <h3>Date:</h3>
                <p>{bet.date}</p>
            </div>
            <div class="section">
                <h3>Parties Involved:</h3>
                <p>{bet.parties}</p>
            </div>
            <div class="section">
                <h3>The Bet:</h3>
                <p>{bet.bet}</p>
            </div>
            <div class="meta">
                Added by <strong>{bet.addedBy}</strong> on {formatDate(bet.addedAt)}
                {#if bet.editHistory.length > 0}
                    &nbsp;·&nbsp;
                    <button class="history-toggle" on:click={(e) => toggleHistory(e, bet.id)}>
                        {showHistoryId === bet.id ? 'Hide' : 'Show'} edit history ({bet.editHistory.length})
                    </button>
                {/if}
            </div>
            {#if showHistoryId === bet.id}
                <div class="history-box">
                    <h4>Full History</h4>
                    {#each buildTimeline(bet) as step, i}
                        <div class="history-entry">
                            <div class="timeline-badge {step.label === 'Created' ? 'badge-created' : 'badge-edited'}">
                                {step.label}
                            </div>
                            <div class="history-meta">
                                <strong>{step.who}</strong> — {formatDate(step.when)}
                                {#if i === buildTimeline(bet).length - 1}<span class="current-tag">current</span>{/if}
                            </div>
                            <div class="history-field"><span class="history-key">Date:</span> {step.values.date}</div>
                            <div class="history-field"><span class="history-key">Parties:</span> {step.values.parties}</div>
                            <div class="history-field"><span class="history-key">Bet:</span> {step.values.bet}</div>
                        </div>
                    {/each}
                </div>
            {/if}
        {/if}
    {/each}

    {#if bets.length === 0}
        <p style="text-align:center;color:var(--g999);">No side bets yet. Hit + to add one.</p>
    {/if}
</div>
{/if}

{#if showForm}
<div class="overlay" on:click|self={cancelForm}>
    <div class="modal">
        <h3>{editingId ? 'Edit Side Bet' : 'Add Side Bet'}</h3>
        <div class="field">
            <label>Date</label>
            <input type="text" bind:value={formDate} placeholder="e.g. 11/1/24" />
        </div>
        <div class="field">
            <label>Parties Involved</label>
            <input type="text" bind:value={formParties} placeholder="e.g. Coyne vs. Ska" />
        </div>
        <div class="field">
            <label>The Bet</label>
            <textarea rows="4" bind:value={formBet} placeholder="Describe the bet..."></textarea>
        </div>
        <div class="modal-actions">
            <button class="btn-secondary" on:click={cancelForm}>Cancel</button>
            <button class="btn-primary"
                disabled={!formDate.trim() || !formParties.trim() || !formBet.trim()}
                on:click={submitForm}>
                {editingId ? 'Save Changes' : 'Add Bet'}
            </button>
        </div>
    </div>
</div>
{/if}

{#if confirmDeleteId}
<div class="overlay" on:click|self={cancelDelete}>
    <div class="modal">
        <h3>Delete this bet?</h3>
        <p style="color:var(--g555);margin:0 0 18px;">This cannot be undone.</p>
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
