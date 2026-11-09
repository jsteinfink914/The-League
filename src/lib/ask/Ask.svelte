<script>
    import { onMount, tick } from 'svelte';
    import { page } from '$app/stores';
    import { ENTRIES, entryById, pageEntries } from './registry.js';
    import { resolveTurn, closestEntries } from './matcher.js';
    import { buildContext } from './data.js';
    import { managers as leagueManagers } from '$lib/utils/leagueInfo';

    // The matcher accepts any plausible season at parse time; each
    // query validates against the real data when it runs.
    const SEASONS_DESC = [2029, 2028, 2027, 2026, 2025, 2024, 2023, 2022];
    const MANAGER_NAMES = leagueManagers.map((m) => m.name);
    const MATCH_CTX = { seasonsDesc: SEASONS_DESC, managerNames: MANAGER_NAMES };
    const EXAMPLES = ['Best at drafting', 'Who is the luckiest manager?', 'Who scored the most points in 2025?'];

    let input = '';
    let messages = [];
    let lastMatch = null; // { entry, params } of the last computed answer
    let sending = false;
    let threadEl = null;
    let nextId = 1;

    let directoryOpen = false;
    let directoryFilter = '';
    const groups = [...new Set(pageEntries().map((e) => e.group))];
    const filterHit = (e) => {
        const f = directoryFilter.trim().toLowerCase();
        if (!f) return true;
        return (e.title + ' ' + e.blurb + ' ' + (e.aliases || []).join(' ')).toLowerCase().includes(f);
    };

    const scrollDown = async () => { await tick(); if (threadEl) threadEl.scrollTop = threadEl.scrollHeight; };
    const push = (msg) => { messages = [...messages, { id: nextId++, ...msg }]; scrollDown(); };
    const replace = (id, msg) => { messages = messages.map((m) => (m.id === id ? { ...m, ...msg } : m)); scrollDown(); };

    const runEntry = async (entry, params = {}, note = '') => {
        const loadingId = nextId;
        push({ id: loadingId, role: 'bot', kind: 'loading' });
        if (entry.kind === 'page') {
            replace(loadingId, { kind: 'page', entry });
            return { headline: entry.title };
        }
        if (entry.kind === 'guide') {
            replace(loadingId, { kind: 'guide', entry });
            return { headline: entry.title };
        }
        try {
            const ctx = await buildContext(entry.needs || []);
            const result = await entry.run(ctx, params);
            replace(loadingId, { kind: 'answer', entry, result, note });
            lastMatch = { entry, params };
            return { headline: result.headline };
        } catch (e) {
            replace(loadingId, { kind: 'error', text: e.message || 'Something went wrong loading that data.' });
            return null;
        }
    };

    // Fire-and-forget turn log (ask_log table): question, what it
    // matched, which route answered, and the headline — so misses and
    // misroutes are visible instead of anecdotal. Never blocks the chat.
    const logTurn = (question, entryId, via, headline) => {
        try {
            fetch('/api/ask/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, entryId, via, headline }),
                keepalive: true,
            }).catch(() => {});
        } catch { /* logging must never break the chat */ }
    };

    const llmRoute = async (text) => {
        try {
            const res = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (!data.ok) return null;
            const entry = entryById(data.entryId);
            return entry ? { entry, params: data.params || {} } : null;
        } catch {
            return null;
        }
    };

    const send = async (rawText) => {
        const text = (rawText ?? input).trim();
        if (!text || sending) return;
        input = '';
        sending = true;
        push({ role: 'user', kind: 'text', text });
        try {
            const turn = resolveTurn(ENTRIES, text, MATCH_CTX, lastMatch);
            // Routing order: a param-only follow-up re-runs the last
            // stat locally (deterministic, no model needed). Every
            // fresh question goes to the LLM router FIRST — it handles
            // freeform phrasing far better than a hand-kept alias list
            // ever will — and the local matcher is the fallback for
            // when the router is unconfigured, down, or unsure. The
            // registry computes every number either way.
            if (turn?.followUp) {
                const r = await runEntry(turn.entry, turn.params, 'Same stat, new filter.');
                logTurn(text, turn.entry.id, 'followup', r?.headline);
                return;
            }
            const routed = await llmRoute(text);
            if (routed) {
                const r = await runEntry(routed.entry, routed.params);
                logTurn(text, routed.entry.id, 'llm', r?.headline);
                return;
            }
            if (turn) {
                const r = await runEntry(turn.entry, turn.params);
                logTurn(text, turn.entry.id, 'local', r?.headline);
                return;
            }
            const [suggestion] = closestEntries(ENTRIES, text, MATCH_CTX, 1);
            push({ role: 'bot', kind: 'miss', suggestion: suggestion || null });
            logTurn(text, null, 'miss', null);
        } finally {
            sending = false;
            scrollDown();
        }
    };

    const followSection = (entryId) => {
        const target = entryById(entryId);
        if (target) runEntry(target, {});
    };

    onMount(() => {
        const q = $page.url.searchParams.get('q');
        if (q) send(q);
    });
</script>

<div class="ask-wrap">
    <h2>Ask the site</h2>
    <p class="lede">Ask anything in plain English — follow-ups work too ("what about 2024?"). Every number is computed live from the same data the pages use; if a question can't be answered from the site's stats, I'll say so instead of making something up.</p>

    <div class="chat">
        <div class="thread" bind:this={threadEl}>
            {#if messages.length === 0}
                <div class="bubble bot">
                    <p class="msg-text">What do you want to know? Try one of these, or type your own:</p>
                    <div class="examples">
                        {#each EXAMPLES as ex}
                            <button class="example" on:click={() => send(ex)}>{ex}</button>
                        {/each}
                    </div>
                </div>
            {/if}
            {#each messages as m (m.id)}
                {#if m.role === 'user'}
                    <div class="bubble user"><p class="msg-text">{m.text}</p></div>
                {:else if m.kind === 'loading'}
                    <div class="bubble bot"><p class="msg-text muted">Pulling the numbers…</p></div>
                {:else if m.kind === 'answer' && m.result}
                    <div class="bubble bot wide">
                        <p class="headline">{m.result.headline}</p>
                        {#if m.note}<p class="follow-note">{m.note}</p>{/if}
                        {#if m.result.rows?.length}
                            <table>
                                <tbody>
                                    {#each m.result.rows as row}
                                        <tr>
                                            <td class="lbl">{row.label}</td>
                                            <td class="val">{row.value}</td>
                                            <td class="sub">{row.sub || ''}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        {/if}
                        {#if m.result.note}<p class="note">{m.result.note}</p>{/if}
                        {#if m.result.href}<a class="go" href={m.result.href}>{m.result.hrefLabel || 'See it on the site'} →</a>{/if}
                    </div>
                {:else if m.kind === 'page' && m.entry}
                    <div class="bubble bot">
                        <p class="headline">{m.entry.title}</p>
                        <p class="msg-text">{m.entry.blurb}</p>
                        <a class="go" href={m.entry.href}>Open {m.entry.title} →</a>
                    </div>
                {:else if m.kind === 'guide' && m.entry}
                    <div class="bubble bot wide">
                        <p class="headline">{m.entry.title}</p>
                        <p class="msg-text">{m.entry.blurb}</p>
                        {#if m.entry.showDirectory}
                            <p class="msg-text">Everything is in the directory — tap "Browse everything on the site" below.</p>
                        {:else if m.entry.sections}
                            {#each m.entry.sections as sec}
                                <div class="section-row">
                                    <p class="msg-text">{sec.text}</p>
                                    <button class="go-btn" on:click={() => followSection(sec.entryId)}>{entryById(sec.entryId)?.title || 'Open'} →</button>
                                </div>
                            {/each}
                        {/if}
                    </div>
                {:else if m.kind === 'miss'}
                    <div class="bubble bot">
                        <p class="msg-text">I can't answer that one yet — answers only come from stats the site actually computes, so I'd rather say that than invent a number.</p>
                        {#if m.suggestion}
                            <p class="msg-text muted">Closest thing I can do:</p>
                            <button class="go-btn" on:click={() => runEntry(m.suggestion, {})}>{m.suggestion.title} →</button>
                        {/if}
                    </div>
                {:else if m.kind === 'error'}
                    <div class="bubble bot"><p class="msg-text">That didn't load: {m.text}</p></div>
                {/if}
            {/each}
        </div>

        <form class="composer" on:submit|preventDefault={() => send()}>
            <input type="text" bind:value={input} placeholder="Ask a question…" aria-label="Ask a question" disabled={sending} />
            <button type="submit" disabled={sending}>Ask</button>
        </form>
    </div>

    <button class="dir-toggle" on:click={() => (directoryOpen = !directoryOpen)}>
        {directoryOpen ? '▾' : '▸'} Browse everything on the site
    </button>

    {#if directoryOpen}
        <div class="directory">
            <input class="dir-filter" type="text" bind:value={directoryFilter} placeholder="Filter the directory…" aria-label="Filter the directory" />

            <h3 class="group-h">Things you can ask</h3>
            <div class="grid">
                {#each ENTRIES.filter((e) => e.kind === 'query' && filterHit(e)) as e}
                    <button class="dir-card btn-card" on:click={() => send(e.examples?.[0] || e.title)}>
                        <strong>{e.title}</strong>
                        <span>{e.blurb}</span>
                    </button>
                {/each}
            </div>

            {#each groups as g}
                {#if pageEntries().some((e) => e.group === g && filterHit(e))}
                    <h3 class="group-h">{g}</h3>
                    <div class="grid">
                        {#each pageEntries().filter((e) => e.group === g && filterHit(e)) as e}
                            <a class="dir-card" href={e.href}>
                                <strong>{e.title}</strong>
                                <span>{e.blurb}</span>
                            </a>
                        {/each}
                    </div>
                {/if}
            {/each}
        </div>
    {/if}
</div>

<style>
    .ask-wrap { max-width: 860px; margin: 0 auto; padding: 16px 12px 48px; color: var(--g111); }
    h2 { font-size: 1.6rem; margin: 12px 0 6px; }
    .lede { color: var(--g555); margin: 0 0 14px; }
    .chat { border: 1px solid var(--ddd); border-radius: 12px; background: var(--fff); display: flex; flex-direction: column; }
    .thread { display: flex; flex-direction: column; gap: 10px; padding: 14px; max-height: 65vh; overflow-y: auto; }
    .bubble { max-width: 92%; border-radius: 12px; padding: 10px 14px; }
    .bubble.bot { background: var(--f3f3f3); align-self: flex-start; }
    .bubble.bot.wide { width: 92%; }
    .bubble.user { background: var(--blueOne); color: var(--fff); align-self: flex-end; }
    .msg-text { margin: 4px 0; }
    .muted { color: var(--g555); }
    .headline { font-weight: 700; margin: 2px 0 6px; }
    .follow-note { color: var(--g555); font-size: 0.85rem; margin: 0 0 6px; font-style: italic; }
    .examples { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .example { border: 1px solid var(--ddd); background: var(--fff); color: var(--g333); border-radius: 999px; padding: 6px 12px; cursor: pointer; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 5px 4px; border-bottom: 1px solid var(--ddd); vertical-align: top; }
    .lbl { font-weight: 600; }
    .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .sub { color: var(--g555); font-size: 0.85rem; text-align: right; }
    .note { color: var(--g555); font-size: 0.9rem; }
    .go { color: var(--blueOne); font-weight: 600; text-decoration: none; }
    .go-btn { background: none; border: none; color: var(--blueOne); font-weight: 600; cursor: pointer; padding: 4px 0; font-size: 0.95rem; text-align: left; }
    .section-row { border-top: 1px solid var(--ddd); padding: 8px 0; }
    .composer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--ddd); }
    .composer input { flex: 1; padding: 12px; border: 1px solid var(--ddd); border-radius: 8px; background: var(--fff); color: var(--g111); font-size: 1rem; }
    .composer button { padding: 12px 20px; border: none; border-radius: 8px; background: var(--blueOne); color: var(--fff); font-size: 1rem; cursor: pointer; }
    .dir-toggle { margin-top: 18px; background: none; border: none; color: var(--blueOne); font-weight: 600; font-size: 1rem; cursor: pointer; padding: 6px 0; }
    .directory { margin-top: 6px; }
    .dir-filter { width: 100%; padding: 10px 12px; border: 1px solid var(--ddd); border-radius: 8px; background: var(--fff); color: var(--g111); font-size: 0.95rem; margin-bottom: 6px; }
    .group-h { font-size: 1.1rem; margin: 20px 0 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
    .dir-card { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--ddd); border-radius: 10px; padding: 12px; text-decoration: none; color: var(--g111); background: var(--fff); text-align: left; }
    .dir-card span { color: var(--g555); font-size: 0.9rem; }
    .btn-card { cursor: pointer; font: inherit; }
</style>
