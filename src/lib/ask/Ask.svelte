<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { ENTRIES, entryById, pageEntries } from './registry.js';
    import { matchEntry, closestEntries } from './matcher.js';
    import { buildContext } from './data.js';
    import { managers as leagueManagers } from '$lib/utils/leagueInfo';

    // The matcher accepts any plausible season at parse time; each
    // query validates against the real data when it runs.
    const SEASONS_DESC = [2029, 2028, 2027, 2026, 2025, 2024, 2023, 2022];
    const MANAGER_NAMES = leagueManagers.map((m) => m.name);

    let question = '';
    let state = 'idle'; // idle | loading | answer | page | guide | miss | error
    let activeEntry = null;
    let result = null;
    let suggestions = [];
    let errorMsg = '';

    const examples = ENTRIES.filter((e) => e.examples?.length).flatMap((e) => e.examples.slice(0, 1)).slice(0, 8);
    const groups = [...new Set(pageEntries().map((e) => e.group))];

    const ask = async (text) => {
        const q = (text ?? question).trim();
        if (!q) return;
        question = q;
        const match = matchEntry(ENTRIES, q, { seasonsDesc: SEASONS_DESC, managerNames: MANAGER_NAMES });
        if (!match) {
            suggestions = closestEntries(ENTRIES, q, { seasonsDesc: SEASONS_DESC, managerNames: MANAGER_NAMES });
            state = 'miss';
            return;
        }
        await runEntry(match.entry, match.params);
    };

    const runEntry = async (entry, params = {}) => {
        activeEntry = entry;
        result = null;
        errorMsg = '';
        if (entry.kind === 'page') { state = 'page'; return; }
        if (entry.kind === 'guide') { state = 'guide'; return; }
        state = 'loading';
        try {
            const ctx = await buildContext(entry.needs || []);
            result = await entry.run(ctx, params);
            state = 'answer';
        } catch (e) {
            errorMsg = e.message || 'Something went wrong loading that data.';
            state = 'error';
        }
    };

    const runExample = (entry) => runEntry(entry, {});
    const followSection = (entryId) => {
        const target = entryById(entryId);
        if (target) runEntry(target, {});
    };

    onMount(() => {
        const q = $page.url.searchParams.get('q');
        if (q) ask(q);
    });
</script>

<div class="ask-wrap">
    <h2>Ask the site</h2>
    <p class="lede">
        Ask in plain English. Every number is computed live from the same data the pages use —
        nothing is made up. If a question can't be answered from the site's stats, this says so.
    </p>

    <form class="ask-form" on:submit|preventDefault={() => ask()}>
        <input type="text" bind:value={question} placeholder="e.g. Who scored the most points in 2025?" aria-label="Ask a question" />
        <button type="submit">Ask</button>
    </form>

    <div class="chips">
        {#each examples as ex}
            <button class="chip" on:click={() => ask(ex)}>{ex}</button>
        {/each}
    </div>

    {#if state === 'loading'}
        <div class="card"><p>Pulling the numbers…</p></div>
    {:else if state === 'error'}
        <div class="card"><p>That didn't load: {errorMsg}</p></div>
    {:else if state === 'page' && activeEntry}
        <div class="card">
            <h3>{activeEntry.title}</h3>
            <p>{activeEntry.blurb}</p>
            <a class="go" href={activeEntry.href}>Open {activeEntry.title} →</a>
        </div>
    {:else if state === 'guide' && activeEntry}
        <div class="card">
            <h3>{activeEntry.title}</h3>
            <p>{activeEntry.blurb}</p>
            {#if activeEntry.showDirectory}
                <p>Everything is listed in the directory below.</p>
            {:else if activeEntry.sections}
                {#each activeEntry.sections as sec}
                    <div class="section-row">
                        <p>{sec.text}</p>
                        <button class="go-btn" on:click={() => followSection(sec.entryId)}>{entryById(sec.entryId)?.title || 'Open'} →</button>
                    </div>
                {/each}
            {/if}
        </div>
    {:else if state === 'answer' && result}
        <div class="card">
            <h3>{result.headline}</h3>
            {#if result.rows?.length}
                <table>
                    <tbody>
                        {#each result.rows as row}
                            <tr>
                                <td class="lbl">{row.label}</td>
                                <td class="val">{row.value}</td>
                                <td class="sub">{row.sub || ''}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
            {#if result.note}<p class="note">{result.note}</p>{/if}
            {#if result.href}<a class="go" href={result.href}>{result.hrefLabel || 'See it on the site'} →</a>{/if}
        </div>
    {:else if state === 'miss'}
        <div class="card">
            <h3>I can't answer that one yet</h3>
            <p>Answers only come from stats the site actually computes, so I'd rather say that than invent a number.</p>
            {#if suggestions.length}
                <p class="note">Closest things I can do:</p>
                {#each suggestions as s}
                    <button class="go-btn block" on:click={() => runEntry(s, {})}>{s.title} →</button>
                {/each}
            {/if}
        </div>
    {/if}

    <h2 id="directory" class="dir-h">What's on this site</h2>
    <p class="lede">Every page and stat, in plain English. The "Ask" entries above compute answers; these are the pages themselves.</p>

    <h3 class="group-h">Things you can ask</h3>
    <div class="grid">
        {#each ENTRIES.filter((e) => e.kind === 'query') as e}
            <button class="dir-card btn-card" on:click={() => runExample(e)}>
                <strong>{e.title}</strong>
                <span>{e.blurb}</span>
            </button>
        {/each}
    </div>

    {#each groups as g}
        <h3 class="group-h">{g}</h3>
        <div class="grid">
            {#each pageEntries().filter((e) => e.group === g) as e}
                <a class="dir-card" href={e.href}>
                    <strong>{e.title}</strong>
                    <span>{e.blurb}</span>
                </a>
            {/each}
        </div>
    {/each}
</div>

<style>
    .ask-wrap { max-width: 1000px; margin: 0 auto; padding: 16px 12px 48px; color: var(--g111); }
    h2 { font-size: 1.6rem; margin: 12px 0 6px; }
    .dir-h { margin-top: 40px; }
    .group-h { font-size: 1.1rem; margin: 22px 0 8px; }
    .lede { color: var(--g555); margin: 0 0 14px; }
    .ask-form { display: flex; gap: 8px; }
    .ask-form input { flex: 1; padding: 12px; border: 1px solid var(--ddd); border-radius: 8px; background: var(--fff); color: var(--g111); font-size: 1rem; }
    .ask-form button { padding: 12px 20px; border: none; border-radius: 8px; background: var(--blueOne); color: var(--fff); font-size: 1rem; cursor: pointer; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 4px; }
    .chip { border: 1px solid var(--ddd); background: var(--f3f3f3); color: var(--g333); border-radius: 999px; padding: 6px 12px; cursor: pointer; font-size: 0.85rem; }
    .card { border: 1px solid var(--ddd); border-radius: 10px; padding: 16px; margin-top: 18px; background: var(--fff); }
    .card h3 { font-size: 1.15rem; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 4px; border-bottom: 1px solid var(--f3f3f3); vertical-align: top; }
    .lbl { font-weight: 600; }
    .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .sub { color: var(--g555); font-size: 0.85rem; text-align: right; }
    .note { color: var(--g555); font-size: 0.9rem; }
    .go { color: var(--blueOne); font-weight: 600; text-decoration: none; }
    .go-btn { background: none; border: none; color: var(--blueOne); font-weight: 600; cursor: pointer; padding: 4px 0; font-size: 0.95rem; text-align: left; }
    .go-btn.block { display: block; }
    .section-row { border-top: 1px solid var(--f3f3f3); padding: 10px 0; }
    .section-row p { margin: 0 0 2px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
    .dir-card { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--ddd); border-radius: 10px; padding: 12px; text-decoration: none; color: var(--g111); background: var(--fff); text-align: left; }
    .dir-card span { color: var(--g555); font-size: 0.9rem; }
    .btn-card { cursor: pointer; font: inherit; }
</style>
