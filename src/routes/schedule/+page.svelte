<script>
    export let data;
    const { matchupsData, leagueTeamManagersData, rostersData, leagueData } = data;

    const year = matchupsData.year;
    const teamManagers = leagueTeamManagersData.teamManagersMap[year] || {};

    const teamName = (rosterId) => teamManagers[rosterId]?.team?.name || `Roster ${rosterId}`;
    const divisionOf = (rosterId) => rostersData.rosters[rosterId]?.settings?.division;

    // real division names from Sleeper league metadata (e.g. "New York East")
    const dn = (d) => leagueData?.metadata?.[`division_${d}`] || `Division ${d}`;
    const blockLabel = (bk) => bk.split('v').map((d) => dn(+d)).join(' vs ');

    // group rosters by division
    const divisions = { 1: [], 2: [], 3: [], 4: [] };
    for (const rosterId of Object.keys(rostersData.rosters)) {
        const d = divisionOf(rosterId);
        if (divisions[d]) divisions[d].push(+rosterId);
    }
    for (const d of [1, 2, 3, 4]) divisions[d].sort((a, b) => a - b);
    const allRosters = [1, 2, 3, 4].flatMap((d) => divisions[d]);

    // the league's pairing method (validated against 2023-2025 history)
    // conferences: New York {1, 2} and D.C. {3, 4}; counterparts play every year,
    // the opposite-conference diagonal rotates on a two-year cycle
    const COUNTERPART = ['1v2', '3v4'];
    const rotating = year % 2 === 1 ? ['1v3', '2v4'] : ['1v4', '2v3'];
    const blockKey = (a, b) => [Math.min(a, b), Math.max(a, b)].join('v');

    const category = (ra, rb) => {
        const da = divisionOf(ra), db = divisionOf(rb);
        if (da === db) return { label: `${dn(da)} rivalry`, cls: 'div' };
        const bk = blockKey(da, db);
        if (COUNTERPART.includes(bk)) return { label: `${dn(da)} vs ${dn(db)} · counterpart`, cls: 'counter' };
        if (rotating.includes(bk)) return { label: `${dn(da)} vs ${dn(db)} · rotation`, cls: 'rotate' };
        return { label: `${dn(da)} vs ${dn(db)}`, cls: 'other' };
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
        if (expectedBlocks.includes(bk) && blockTotals[bk] !== 16) violations.push(`${blockLabel(bk)} has ${blockTotals[bk]} matchups — a full block is 16`);
        if (!expectedBlocks.includes(bk) && blockTotals[bk] !== 0) violations.push(`${blockLabel(bk)} has ${blockTotals[bk]} matchups — those divisions shouldn't meet in ${year}`);
    }

    // ---- team filter -------------------------------------------------------
    let selected = null; // roster_id or null for all teams
    $: selectedGames = selected == null ? null : weeks.map(({ week, games }) => {
        const g = games.find((gm) => gm.a === selected || gm.b === selected);
        if (!g) return null;
        const opp = g.a === selected ? g.b : g.a;
        return { week, opp, cat: g.cat };
    }).filter(Boolean);
    $: selectedCounts = selectedGames ? selectedGames.reduce((acc, g) => { acc[g.cat.cls] = (acc[g.cat.cls] || 0) + 1; return acc; }, {}) : {};
</script>

<style>
    .holder { max-width: 1100px; margin: 0 auto; padding: 1em; }
    h1 { color: var(--blueOne); text-align: center; margin-bottom: 0.2em; }
    .sub { text-align: center; color: var(--g555); margin-top: 0; }
    .explainer { background: var(--headerPrimary); border: 1px solid var(--blueOne); border-radius: 10px; padding: 14px 18px; margin: 1em 0; line-height: 1.55; color: var(--g111); }
    .divGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 1em 0; }
    .divCard { background: var(--fff); border: 1px solid var(--ddd); border-top: 4px solid var(--blueOne); border-radius: 10px; padding: 10px 14px; }
    .divCard h3 { margin: 0.2em 0 0.5em; color: var(--blueOne); font-size: 1em; }
    .divCard div { padding: 2px 0; color: var(--g111); }
    .blocks { display: flex; flex-wrap: wrap; gap: 8px; margin: 0.6em 0 1em; }
    .block { border-radius: 999px; padding: 4px 12px; font-size: 0.85em; border: 1px solid var(--ddd); color: var(--g111); background: var(--fff); }
    .block.ok { background: var(--waiverAdd); }
    .block.bad { background: var(--waiverDrop); }
    .violations { background: var(--waiverDrop); border: 1px solid var(--ddd); border-radius: 10px; padding: 12px 18px; margin: 1em 0; color: var(--g111); }
    .violations h3 { margin: 0.2em 0 0.5em; color: var(--g111); }
    .clean { background: var(--waiverAdd); border: 1px solid var(--ddd); border-radius: 10px; padding: 12px 18px; margin: 1em 0; color: var(--g111); }
    .filterLabel { color: var(--blueOne); font-weight: 700; margin: 1.2em 0 0.4em; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 1em; }
    .chip { border: 1px solid var(--ddd); background: var(--fff); color: var(--g111); border-radius: 999px; padding: 5px 12px; font-size: 0.85em; cursor: pointer; }
    .chip.active { background: var(--blueOne); border-color: var(--blueOne); color: #fff; }
    .teamSummary { background: var(--fff); border: 1px solid var(--ddd); border-left: 4px solid var(--blueOne); border-radius: 8px; padding: 10px 14px; margin-bottom: 1em; color: var(--g111); line-height: 1.5; }
    .weekGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
    .week { background: var(--fff); border: 1px solid var(--ddd); border-radius: 10px; padding: 10px 14px; }
    .week h3 { margin: 0.2em 0 0.6em; color: var(--blueOne); border-bottom: 2px solid var(--blueOne); padding-bottom: 4px; }
    .game { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--eee); color: var(--g111); }
    .game:last-child { border-bottom: none; }
    .game .mine { font-weight: 700; }
    .tag { font-size: 0.68em; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; border-radius: 4px; padding: 1px 6px; background: var(--f3f3f3); color: var(--g333); }
    .tag.div { background: var(--headerPrimary); color: var(--blueOne); }
    .tag.counter { background: var(--waiverAdd); color: var(--g111); }
    .tag.rotate { background: var(--badgeRookieY3Bg); color: var(--badgeRookieY3Text); }
    .tag.other { background: var(--waiverDrop); color: var(--g111); }
    .entryList { background: var(--fff); border: 1px solid var(--ddd); border-radius: 10px; padding: 6px 14px; }
    .entryRow { display: flex; gap: 10px; align-items: baseline; padding: 7px 0; border-bottom: 1px solid var(--eee); color: var(--g111); }
    .entryRow:last-child { border-bottom: none; }
    .entryWeek { color: var(--g555); font-size: 0.85em; min-width: 58px; }
</style>

<div class="holder">
    <h1>{year} Schedule</h1>
    <p class="sub">Who plays who — and how the pairings are built.</p>

    <div class="explainer">
        Every team plays its <b>division rivals 2x</b> (6 games), a full block against its
        <b>conference counterpart</b> — <b>{blockLabel('1v2')}</b> and <b>{blockLabel('3v4')}</b>, every year —
        and a full block against one <b>opposite-conference</b> division, which rotates on a two-year cycle:
        in {year} that's <b>{rotating.map(blockLabel).join(' and ')}</b>.
        That's 6 + 4 + 4 = 14 regular-season games.
    </div>

    <div class="divGrid">
        {#each [1, 2, 3, 4] as d}
            <div class="divCard">
                <h3>{dn(d)}</h3>
                {#each divisions[d] as rosterId}
                    <div>{teamName(rosterId)}</div>
                {/each}
            </div>
        {/each}
    </div>

    <h3 style="color: var(--blueOne);">Division blocks in {year}</h3>
    <div class="blocks">
        {#each Object.entries(blockTotals) as [bk, total]}
            <span class="block {(expectedBlocks.includes(bk) && total === 16) || (!expectedBlocks.includes(bk) && total === 0) ? 'ok' : 'bad'}">
                {blockLabel(bk)} — {total} matchups{expectedBlocks.includes(bk) ? ' (full block)' : ' (not scheduled)'}
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

    <div class="filterLabel">Filter by team — tap a team to get its full schedule in week order, ready to input:</div>
    <div class="chips">
        <button class="chip {selected == null ? 'active' : ''}" on:click={() => (selected = null)}>All teams</button>
        {#each allRosters as rosterId}
            <button class="chip {selected === rosterId ? 'active' : ''}" on:click={() => (selected = selected === rosterId ? null : rosterId)}>{teamName(rosterId)}</button>
        {/each}
    </div>

    {#if selected != null && selectedGames}
        <div class="teamSummary">
            <b>{teamName(selected)}</b> ({dn(divisionOf(selected))}) — {selectedGames.length} games:
            {selectedCounts.div || 0} division · {selectedCounts.counter || 0} counterpart · {selectedCounts.rotate || 0} rotation{(selectedCounts.other || 0) ? ` · ${selectedCounts.other} other` : ''}
        </div>
        <div class="entryList">
            {#each selectedGames as g}
                <div class="entryRow">
                    <span class="entryWeek">Week {g.week}</span>
                    <span>vs <b>{teamName(g.opp)}</b></span>
                    <span class="tag {g.cat.cls}">{g.cat.label}</span>
                </div>
            {/each}
        </div>
    {:else}
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
    {/if}
</div>
