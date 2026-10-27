<script>
    export let data;
    const { matchupsData, leagueTeamManagersData, rostersData } = data;

    const year = matchupsData.year;
    const teamManagers = leagueTeamManagersData.teamManagersMap[year] || {};

    const teamName = (rosterId) => teamManagers[rosterId]?.team?.name || `Roster ${rosterId}`;
    const divisionOf = (rosterId) => rostersData.rosters[rosterId]?.settings?.division;

    // group rosters by division
    const divisions = { 1: [], 2: [], 3: [], 4: [] };
    for (const rosterId of Object.keys(rostersData.rosters)) {
        const d = divisionOf(rosterId);
        if (divisions[d]) divisions[d].push(+rosterId);
    }
    for (const d of [1, 2, 3, 4]) divisions[d].sort((a, b) => a - b);

    // the league's pairing method (validated against 2023-2025 history)
    const COUNTERPART = ['1v3', '2v4'];
    const rotating = year % 2 === 1 ? ['1v2', '3v4'] : ['1v4', '2v3'];
    const blockKey = (a, b) => [Math.min(a, b), Math.max(a, b)].join('v');

    const category = (ra, rb) => {
        const da = divisionOf(ra), db = divisionOf(rb);
        if (da === db) return { label: `Div ${da} rivalry`, cls: 'div' };
        const bk = blockKey(da, db);
        if (COUNTERPART.includes(bk)) return { label: `Div ${da} vs Div ${db} · counterpart`, cls: 'counter' };
        if (rotating.includes(bk)) return { label: `Div ${da} vs Div ${db} · rotation`, cls: 'rotate' };
        return { label: `Div ${da} vs Div ${db}`, cls: 'other' };
    };

    // build week-by-week pairings + season pair counts
    const pairCount = new Map();
    const pairKey = (a, b) => [Math.min(a, b), Math.max(a, b)].join('v');
    const weeks = [];
    for (const mw of matchupsData.matchupWeeks || []) {
        if (!mw || mw.unavailable || !mw.matchups) continue;
        const games = [];
        for (const mid of Object.keys(mw.matchups)) {
            const pair = mw.matchups[mid];
            if (!pair || pair.length !== 2) continue;
            const [a, b] = pair;
            games.push({ a: a.roster_id, b: b.roster_id, cat: category(a.roster_id, b.roster_id) });
            const k = pairKey(a.roster_id, b.roster_id);
            pairCount.set(k, (pairCount.get(k) || 0) + 1);
        }
        if (games.length) weeks.push({ week: mw.week, games });
    }
    weeks.sort((x, y) => x.week - y.week);

    // block totals + rule violations
    const blockTotals = { '1v2': 0, '1v3': 0, '1v4': 0, '2v3': 0, '2v4': 0, '3v4': 0 };
    const violations = [];
    for (const [k, c] of pairCount.entries()) {
        const [a, b] = k.split('v').map(Number);
        const da = divisionOf(a), db = divisionOf(b);
        if (da === db) {
            if (c !== 2) violations.push(`${teamName(a)} vs ${teamName(b)} meet ${c}x — division rivals should meet 2x`);
        } else {
            blockTotals[blockKey(da, db)] += c;
            if (c !== 1) violations.push(`${teamName(a)} vs ${teamName(b)} meet ${c}x — cross-division pairs should meet 1x`);
        }
    }
    const expectedBlocks = [...COUNTERPART, ...rotating];
    for (const bk of Object.keys(blockTotals)) {
        if (expectedBlocks.includes(bk) && blockTotals[bk] !== 16) violations.push(`Division block ${bk.replace('v', ' vs ')} has ${blockTotals[bk]} matchups — a full block is 16`);
        if (!expectedBlocks.includes(bk) && blockTotals[bk] !== 0) violations.push(`Division block ${bk.replace('v', ' vs ')} has ${blockTotals[bk]} matchups — those divisions shouldn't meet in ${year}`);
    }
</script>

<style>
    .holder { max-width: 1100px; margin: 0 auto; padding: 1em; }
    h1 { color: #00316b; text-align: center; margin-bottom: 0.2em; }
    .sub { text-align: center; color: var(--g555, #555); margin-top: 0; }
    .explainer { background: var(--fff, #fff); border: 1px solid #00316b; border-radius: 10px; padding: 14px 18px; margin: 1em 0; line-height: 1.55; }
    .divGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 1em 0; }
    .divCard { background: var(--fff, #fff); border: 1px solid #ddd; border-top: 4px solid #00316b; border-radius: 10px; padding: 10px 14px; }
    .divCard h3 { margin: 0.2em 0 0.5em; color: #00316b; font-size: 1em; }
    .divCard div { padding: 2px 0; }
    .blocks { display: flex; flex-wrap: wrap; gap: 8px; margin: 0.6em 0 1em; }
    .block { border-radius: 999px; padding: 4px 12px; font-size: 0.85em; border: 1px solid #00316b; }
    .block.ok { background: #e8f5e9; }
    .block.bad { background: #fdecea; border-color: #920505; }
    .violations { background: #fdecea; border: 1px solid #920505; border-radius: 10px; padding: 12px 18px; margin: 1em 0; }
    .violations h3 { color: #920505; margin: 0.2em 0 0.5em; }
    .clean { background: #e8f5e9; border: 1px solid #2e7d32; border-radius: 10px; padding: 12px 18px; margin: 1em 0; }
    .weekGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
    .week { background: var(--fff, #fff); border: 1px solid #ddd; border-radius: 10px; padding: 10px 14px; }
    .week h3 { margin: 0.2em 0 0.6em; color: #00316b; border-bottom: 2px solid #00316b; padding-bottom: 4px; }
    .game { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 4px 0; border-bottom: 1px solid #eee; }
    .game:last-child { border-bottom: none; }
    .tag { font-size: 0.68em; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; border-radius: 4px; padding: 1px 6px; }
    .tag.div { background: #e3ecf7; color: #00316b; }
    .tag.counter { background: #e8f5e9; color: #2e7d32; }
    .tag.rotate { background: #fff4e0; color: #a15c00; }
    .tag.other { background: #fdecea; color: #920505; }
</style>

<div class="holder">
    <h1>{year} Schedule</h1>
    <p class="sub">Who plays who — and how the pairings are built.</p>

    <div class="explainer">
        Every team plays its <b>division rivals 2x</b> (6 games), a full block against its
        <b>conference counterpart</b> division — <b>Div 1 vs Div 3</b> and <b>Div 2 vs Div 4</b>, every year —
        and a full block against one <b>opposite-conference</b> division, which rotates on a two-year cycle:
        in {year} that's <b>{rotating.map(b => b.replace('v', ' vs ')).join(' and ')}</b>.
        That's 6 + 4 + 4 = 14 regular-season games.
    </div>

    <div class="divGrid">
        {#each [1, 2, 3, 4] as d}
            <div class="divCard">
                <h3>Division {d}</h3>
                {#each divisions[d] as rosterId}
                    <div>{teamName(rosterId)}</div>
                {/each}
            </div>
        {/each}
    </div>

    <h3 style="color:#00316b;">Division blocks in {year}</h3>
    <div class="blocks">
        {#each Object.entries(blockTotals) as [bk, total]}
            <span class="block {(expectedBlocks.includes(bk) && total === 16) || (!expectedBlocks.includes(bk) && total === 0) ? 'ok' : 'bad'}">
                Div {bk.replace('v', ' vs Div ')} — {total} matchups{expectedBlocks.includes(bk) ? ' (full block)' : ' (not scheduled)'}
            </span>
        {/each}
    </div>

    {#if violations.length}
        <div class="violations">
            <h3>⚠️ This schedule breaks the pairing rules</h3>
            {#each violations as v}<div>{v}</div>{/each}
        </div>
    {:else if weeks.length}
        <div class="clean">✅ This schedule follows the pairing method — every rule checks out.</div>
    {/if}

    <div class="weekGrid">
        {#each weeks as { week, games }}
            <div class="week">
                <h3>Week {week}</h3>
                {#each games as g}
                    <div class="game">
                        <span>{teamName(g.a)} vs {teamName(g.b)}</span>
                        <span class="tag {g.cat.cls}">{g.cat.label}</span>
                    </div>
                {/each}
            </div>
        {/each}
    </div>
</div>
