<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { createSetParams } from '$lib/utils/urlParams';
    import { getRecordAnatomy } from '$lib/utils/helperFunctions/recordAnatomy';
    import { GROUPS, GO_OFF, goOffSplit } from '$lib/utils/helperFunctions/recordAnatomyMath';

    // Which H2H section this route shows: 'luck' | 'anatomy' | 'stats'.
    export let section = 'luck';

    import { getLeagueTeamManagers } from '$lib/utils/helperFunctions/leagueTeamManagers';

    let loading = true;
    let error = null;
    let data = null;
    let teamManagers = null;

    let selectedSeason = null;
    let selectedRoster = null;

    onMount(async () => {
        try {
            const [anatomy, managers] = await Promise.all([getRecordAnatomy(), getLeagueTeamManagers()]);
            data = anatomy;
            teamManagers = managers;
            const params = $page.url.searchParams;
            const seasonParam = Number(params.get('season'));
            selectedSeason = data.seasons.includes(seasonParam) ? seasonParam : data.currentYear;
            const teamParam = Number(params.get('team'));
            selectedRoster = data.teamSeasons[`${selectedSeason}-${teamParam}`] ? teamParam : defaultRoster(selectedSeason);
            if (seasonParam && data.seasons.includes(seasonParam)) luckSeason = seasonParam;
            const sortParam = params.get('sort');
            if (['wins', 'expectedWins', 'luck', 'schedLuck'].includes(sortParam)) luckSortKey = sortParam;
            if (params.get('dir') === 'asc') luckSortDir = 1;
            else if (params.get('dir') === 'desc') luckSortDir = -1;
        } catch (err) {
            console.error(err);
            error = 'Record anatomy data could not be loaded. Try again later.';
        }
        loading = false;
    });

    const teamInfo = (season, rosterID) => teamManagers?.teamManagersMap?.[season]?.[rosterID];
    const teamName = (season, rosterID) => {
        const info = teamInfo(season, rosterID);
        const uid = info?.managers?.[0];
        return (uid && teamManagers?.users?.[uid]?.display_name) || info?.team?.name || `Team ${rosterID}`;
    };
    const teamAvatar = (season, rosterID) => teamInfo(season, rosterID)?.team?.avatar;

    // Filters live in the URL query string so views are shareable.
    const setParams = createSetParams(page);

    // Go-off thresholds for the Stats page sliders. Defaults are the
    // round-number lines in GO_OFF; a slider's value lives in the URL
    // (?qb=, ?rb=, ?wr=, ?te=) whenever it differs from the default.
    const THRESH_RANGES = { QB: [15, 40], RB: [25, 70], WR: [25, 70], TE: [8, 30] };
    const initThreshold = (param, pos) => {
        const raw = Number($page.url.searchParams.get(param));
        const [lo, hi] = THRESH_RANGES[pos];
        return Number.isInteger(raw) && raw >= lo && raw <= hi ? raw : GO_OFF[pos];
    };
    let thresholds = {
        QB: initThreshold('qb', 'QB'), RB: initThreshold('rb', 'RB'),
        WR: initThreshold('wr', 'WR'), TE: initThreshold('te', 'TE'),
    };
    const syncThresholdParams = () => setParams({
        qb: thresholds.QB === GO_OFF.QB ? null : thresholds.QB,
        rb: thresholds.RB === GO_OFF.RB ? null : thresholds.RB,
        wr: thresholds.WR === GO_OFF.WR ? null : thresholds.WR,
        te: thresholds.TE === GO_OFF.TE ? null : thresholds.TE,
    });
    $: splits = data ? GROUPS.map((pos) => goOffSplit(data.games, pos, thresholds[pos])) : [];
    $: splitsBySeason = data ? [...new Set(data.games.map((g) => g.season))].sort((a, b) => a - b)
        .map((season) => ({
            season,
            splits: GROUPS.map((pos) => {
                const sp = goOffSplit(data.games.filter((g) => g.season === season), pos, thresholds[pos]);
                return { pos, winPct: sp.hiWinPct, n: sp.hiN };
            }),
        })) : [];

    // Default to the team with the most extreme luck story that season.
    const defaultRoster = (season) => {
        const teams = Object.values(data.teamSeasons).filter((t) => t.season === season);
        if (!teams.length) return null;
        return teams.reduce((best, t) => (Math.abs(t.luck) > Math.abs(best.luck) ? t : best), teams[0]).rosterID;
    };

    $: seasonTeams = data
        ? Object.values(data.teamSeasons).filter((t) => t.season === selectedSeason).sort((a, b) => teamName(selectedSeason, a.rosterID).localeCompare(teamName(selectedSeason, b.rosterID)))
        : [];
    $: team = data && selectedRoster != null ? data.teamSeasons[`${selectedSeason}-${selectedRoster}`] : null;
    $: myGames = data && team ? data.games.filter((g) => g.season === selectedSeason && g.rosterID === selectedRoster) : [];
    $: recordCounts = {
        w: myGames.filter((g) => g.win === 1).length,
        l: myGames.filter((g) => g.win === 0).length,
        t: myGames.filter((g) => g.win === 0.5).length,
    };
    $: maxEdge = team ? Math.max(5, ...Object.values(team.edges).map((v) => Math.abs(v))) : 5;

    const fmtLuck = (v) => `${v > 0 ? '+' : ''}${fmt1(v)}`;
    const fmtWins = (w) => (Number.isInteger(w) ? `${w}` : fmt1(w));
    let luckSeason = 'all';
    let luckSortKey = 'luck';
    let luckSortDir = -1;
    $: luckRows = data ? buildLuckRows(luckSeason) : [];
    const sortLuck = (rows, key, dir) => [...rows].sort((a, b) => (a[key] - b[key]) * dir);
    const sortLuckBy = (key) => {
        if (luckSortKey === key) luckSortDir = -luckSortDir;
        else { luckSortKey = key; luckSortDir = -1; }
        const isDefault = luckSortKey === 'luck' && luckSortDir === -1;
        setParams({ sort: isDefault ? null : luckSortKey, dir: isDefault ? null : (luckSortDir === 1 ? 'asc' : 'desc') });
    };
    const luckArrow = (key, cur, dir) => (cur === key ? (dir === -1 ? ' ▼' : ' ▲') : '');
    const buildLuckRows = (sel) => {
        if (sel === 'all') {
            return [...new Set(Object.values(data.teamSeasons).map((t) => t.rosterID))]
                .map((rosterID) => {
                    const mine = Object.values(data.teamSeasons).filter((t) => t.rosterID === rosterID);
                    return {
                        name: teamName(data.currentYear, rosterID),
                        wins: mine.reduce((s, t) => s + t.wins, 0),
                        expectedWins: mine.reduce((s, t) => s + t.expectedWins, 0),
                        luck: mine.reduce((s, t) => s + t.luck, 0),
                        schedLuck: mine.reduce((s, t) => s + t.games, 0)
                            ? mine.reduce((s, t) => s + t.scheduleLuck * t.games, 0) / mine.reduce((s, t) => s + t.games, 0)
                            : 0,
                    };
                })
                .sort((a, b) => b.luck - a.luck);
        }
        const season = Number(sel);
        return Object.values(data.teamSeasons)
            .filter((t) => t.season === season)
            .map((t) => ({ name: teamName(season, t.rosterID), wins: t.wins, expectedWins: t.expectedWins, luck: t.luck, schedLuck: t.scheduleLuck }))
            .sort((a, b) => b.luck - a.luck);
    };

    // Changing the year keeps the team you're looking at; it only falls
    // back to that season's most extreme luck story if the team somehow
    // isn't in the selected season.
    const changeSeason = () => {
        if (!data?.teamSeasons?.[`${selectedSeason}-${selectedRoster}`]) {
            selectedRoster = defaultRoster(selectedSeason);
        }
        setParams({ season: selectedSeason, team: selectedRoster });
    };

    const fmtR = (r) => (r > 0 ? `+${r.toFixed(2)}` : r.toFixed(2));
    const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
    const fmt2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
    const fmtSigned1 = (n) => (n > 0 ? `+${fmt1(n)}` : fmt1(n));

    const verdict = (t) => {
        if (!t) return '';
        let luckPart;
        if (t.luck >= 1) luckPart = `Running hot: ${fmt1(t.wins)} wins against ${fmt1(t.expectedWins)} expected — the record flatters this team.`;
        else if (t.luck <= -1) luckPart = `Record undersells them: ${fmt1(t.wins)} wins against ${fmt1(t.expectedWins)} expected from their scoring.`;
        else luckPart = `The record is honest: ${fmt1(t.wins)} wins, right in line with the ${fmt1(t.expectedWins)} their scoring earns.`;
        let schedPart = '';
        if (t.sosPtsRank <= 4) schedPart = ` And they did it against the ${t.sosPtsRank === 1 ? 'toughest' : `#${t.sosPtsRank} toughest`} schedule in the league.`;
        else if (t.sosPtsRank >= 13) schedPart = ` It helps that the schedule was one of the league's softest (#${t.sosPtsRank} of 16 by opponent scoring).`;
        return luckPart + schedPart;
    };
</script>

<h1>H2H</h1>
<p class="intro">Why does everyone have the record they have? Points, schedule, luck, and the positional punches that actually decide games — measured across every season of the league.</p>

{#if loading}
    <p class="loading">Crunching every matchup in league history…</p>
{:else if error}
    <p class="loading">{error}</p>
{:else if data}
    <div class="tabBar">
        <a class="tabBtn" class:active={section === 'luck'} href="/h2h/luck">Luck</a>
        <a class="tabBtn" class:active={section === 'anatomy'} href="/h2h/anatomy">Anatomy of a Record</a>
        <a class="tabBtn" class:active={section === 'stats'} href="/h2h/stats">Stats</a>
    </div>

    {#if section === 'stats'}
    <section>
        <h3>Point Correlation</h3>
        <p class="note">Across {data.laws.teamGames} team-games ({data.seasons[data.seasons.length - 1]}–{data.seasons[0]}): what actually tracks with winning — and how much it changes year to year.</p>
        <table class="dataTable">
            <thead>
                <tr><th>Season</th><th>Points For ↔ Record</th><th>Points Against ↔ Record</th><th>Verdict</th></tr>
            </thead>
            <tbody>
                {#each data.laws.correlations as row}
                    <tr class:pooled={row.season === 'All'}>
                        <td>{row.season === 'All' ? 'All seasons' : row.season}</td>
                        <td>{fmtR(row.pf)}</td>
                        <td>{fmtR(row.pa)}</td>
                        <td>{Math.abs(row.pf) >= Math.abs(row.pa) ? 'Scoring drives it' : 'Schedule drives it'}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        <p class="note">Correlation runs −1 to +1. Points For is always strongly positive; Points Against swings — nearly irrelevant in 2022, the strongest force in the league in 2023.</p>

        <h3>When your group goes off, you win</h3>
        <p class="note">Drag a slider to move that group's line — the cards and the season table below update together.</p>
        <div class="splitGrid">
            {#each splits as s}
                <div class="splitCard">
                    <div class="splitTitle">Your {s.pos}s score <strong class="splitThreshold">{s.threshold}+</strong></div>
                    <div class="splitBig">{s.hiWinPct}% <span class="splitLabel">win rate</span></div>
                    <div class="splitSub">vs {s.loWinPct}% when they don't · {s.hiN} games</div>
                    <input class="splitSlider" type="range" min={THRESH_RANGES[s.pos][0]} max={THRESH_RANGES[s.pos][1]} step="1" bind:value={thresholds[s.pos]} on:change={syncThresholdParams} aria-label="{s.pos} go-off threshold" />
                </div>
            {/each}
        </div>
        <table class="dataTable">
            <thead>
                <tr><th>Season</th>{#each splits as s}<th>Your {s.pos} <strong>{s.threshold}+</strong></th>{/each}</tr>
            </thead>
            <tbody>
                {#each splitsBySeason as row}
                    <tr>
                        <td>{row.season}</td>
                        {#each row.splits as s}<td>{s.n ? `${s.winPct}%` : '—'}{#if s.n} <span class="gamesN">({s.n})</span>{/if}</td>{/each}
                    </tr>
                {/each}
            </tbody>
        </table>

        <h3>The 20-point ladder</h3>
        <p class="note">Winners average {data.laws.avgTwentyInWins} starters over 20 points; losers average {data.laws.avgTwentyInLosses}. Your win rate by how many of your starters clear 20:</p>
        <table class="dataTable">
            <thead>
                <tr><th>Starters over 20</th><th>Win rate</th><th>Games</th></tr>
            </thead>
            <tbody>
                {#each data.laws.ladder as rung}
                    <tr><td>{rung.label}</td><td>{rung.winPct}%</td><td>{rung.n}</td></tr>
                {/each}
            </tbody>
        </table>
    </section>
    {/if}

    {#if section === 'luck'}
    <section>
        <h3>Luck Over Time</h3>
        <div class="selectors">
            <label>Season
                <select value={luckSeason} on:change={(e) => { luckSeason = e.target.value === 'all' ? 'all' : Number(e.target.value); setParams({ season: luckSeason === 'all' ? null : luckSeason }); }}>
                    <option value="all">All-time</option>
                    {#each data.seasons as s}<option value={s}>{s}</option>{/each}
                </select>
            </label>
        </div>
        <p class="note">Actual wins minus all-play expected wins — positive means the schedule handed them wins, negative means their scoring deserved better. Click a column header to sort.</p>
        <table class="dataTable">
            <thead>
                <tr><th>Team</th><th class="sortable" on:click={() => sortLuckBy('wins')}>Wins{luckArrow('wins', luckSortKey, luckSortDir)}</th><th class="sortable" on:click={() => sortLuckBy('expectedWins')}>Exp. Wins{luckArrow('expectedWins', luckSortKey, luckSortDir)}</th><th class="sortable" on:click={() => sortLuckBy('luck')}>Luck{luckArrow('luck', luckSortKey, luckSortDir)}</th><th class="sortable" on:click={() => sortLuckBy('schedLuck')}>Sched. Luck{luckArrow('schedLuck', luckSortKey, luckSortDir)}</th></tr>
            </thead>
            <tbody>
                {#each sortLuck(luckRows, luckSortKey, luckSortDir) as row}
                    <tr><td>{row.name}</td><td>{fmtWins(row.wins)}</td><td>{fmt2(row.expectedWins)}</td><td><strong>{fmtLuck(row.luck)}</strong></td><td>{fmtLuck(row.schedLuck)}</td></tr>
                {/each}
            </tbody>
        </table>
    </section>
    {/if}

    {#if section === 'anatomy'}
    <section>
        <h2>Anatomy of a Record</h2>
        <div class="selectors">
            <label>Season
                <select value={selectedSeason} on:change={(e) => { selectedSeason = Number(e.target.value); changeSeason(); }}>
                    {#each data.seasons as season}<option value={season}>{season}</option>{/each}
                </select>
            </label>
            <label>Team
                <select value={selectedRoster} on:change={(e) => { selectedRoster = Number(e.target.value); setParams({ team: selectedRoster }); }}>
                    {#each seasonTeams as t}<option value={t.rosterID}>{teamName(selectedSeason, t.rosterID)}</option>{/each}
                </select>
            </label>
        </div>

        {#if team}
            <div class="teamHead">
                {#if teamAvatar(selectedSeason, selectedRoster)}<img class="avatar" src={teamAvatar(selectedSeason, selectedRoster)} alt="" />{/if}
                <span class="teamName">{teamName(selectedSeason, selectedRoster)}</span>
                <span class="teamRecord">{recordCounts.w}–{recordCounts.l}{recordCounts.t ? `–${recordCounts.t}` : ''}</span>
            </div>
            <p class="verdict">{verdict(team)}</p>

            <div class="tileGrid">
                <div class="tile"><div class="tileVal">{fmt1(team.pfPerGame)} <span class="tileRank">(#{team.pfRank})</span></div><div class="tileLabel">Points For / game</div></div>
                <div class="tile"><div class="tileVal">{fmt1(team.paPerGame)} <span class="tileRank">(#{team.paRank})</span></div><div class="tileLabel">Points Against / game</div></div>
                <div class="tile"><div class="tileVal">{fmt2(team.sosPts)} <span class="tileRank">(#{team.sosPtsRank})</span></div><div class="tileLabel">SOS (Pts)</div></div>
                <div class="tile"><div class="tileVal">{team.sosRec.toFixed(3)} <span class="tileRank">(#{team.sosRecRank})</span></div><div class="tileLabel">SOS (Rec)</div></div>
                <div class="tile"><div class="tileVal">{fmtLuck(team.scheduleLuck)} <span class="tileRank">(#{team.scheduleLuckRank})</span></div><div class="tileLabel">Schedule Luck (opp vs their avg)</div></div>
                <div class="tile"><div class="tileVal">{fmt1(team.expectedWins)}</div><div class="tileLabel">Expected wins (all-play)</div></div>
                <div class="tile"><div class="tileVal" class:hot={team.luck >= 1} class:cold={team.luck <= -1}>{team.luck > 0 ? '+' : ''}{fmt1(team.luck)}</div><div class="tileLabel">Luck (wins vs expected)</div></div>
            </div>

            <h3>Positional edge <span class="note inline">— your scoring by position vs the league average, per game</span></h3>
            <div class="edges">
                {#each data.groups as pos}
                    <div class="edgeRow">
                        <span class="edgePos">{pos}</span>
                        <div class="edgeTrack">
                            <div class="edgeZero"></div>
                            <div class="edgeBar" class:neg={team.edges[pos] < 0} style="width: {Math.min(Math.abs(team.edges[pos]) / maxEdge * 50, 50)}%; {team.edges[pos] < 0 ? `right: 50%;` : `left: 50%;`}"></div>
                        </div>
                        <span class="edgeVal">{fmtSigned1(team.edges[pos])}</span>
                    </div>
                {/each}
            </div>

        {/if}
    </section>
    {/if}
{/if}

<style>
    h1 { font-size: 2.2em; line-height: 1.3em; margin: 1.5em 0 0.3em; }
    h2 { font-size: 1.4rem; margin: 1.3em 0 0.35em; }
    h3 { font-size: 1.1rem; margin: 1.1em 0 0.35em; }
    .intro { max-width: 720px; }
    .note { font-size: 0.85em; font-style: italic; color: var(--g555); max-width: 720px; }
    .note.inline { font-size: 0.75em; font-weight: normal; }
    .loading { display: block; margin: 80px auto; text-align: center; }
    section { margin-bottom: 1.6em; }
    .tabBar { display: flex; gap: 0.4em; flex-wrap: wrap; margin: 1em 0 0.4em; border-bottom: 2px solid var(--ddd); }
    .tabBtn { background: none; border: none; text-decoration: none; display: inline-block; border-bottom: 3px solid transparent; margin-bottom: -2px; padding: 0.45em 0.8em; font-size: 1.05em; font-weight: bold; color: var(--g555); cursor: pointer; }
    .tabBtn:hover { color: var(--g111); }
    .tabBtn.active { color: var(--g111); border-bottom-color: #2e86c1; }
    .dataTable { border-collapse: collapse; width: 100%; max-width: 720px; margin: 0.4em 0 0.8em; }
    .dataTable th, .dataTable td { border: 1px solid var(--ddd); padding: 0.35em 0.55em; text-align: left; font-size: 0.95em; }
    .dataTable th { background: var(--f3f3f3); }
    .dataTable th.sortable { cursor: pointer; user-select: none; }
    .dataTable tr.pooled { font-weight: bold; background: var(--f3f3f3); }
    .splitGrid { display: flex; flex-wrap: wrap; gap: 0.6em; margin: 0.4em 0 0.8em; }
    .splitCard { border: 1px solid var(--ddd); border-radius: 8px; padding: 0.6em 0.85em; min-width: 150px; flex: 1; max-width: 220px; }
    .splitTitle { font-size: 0.85em; color: var(--g555); }
    .splitThreshold { font-size: 1.35em; color: var(--g111); }
    .splitBig { font-size: 1.6em; font-weight: normal; margin: 0.15em 0; }
    .gamesN { color: var(--g555); font-size: 0.85em; }
    .splitLabel { font-size: 0.5em; font-weight: normal; color: var(--g555); }
    .splitSub { font-size: 0.8em; color: var(--g555); }
    .splitSlider { width: 100%; margin-top: 0.55em; accent-color: #2e86c1; }
    .selectors { display: flex; gap: 1em; margin: 0.5em 0 1em; flex-wrap: wrap; }
    .selectors select { margin-left: 0.4em; padding: 0.3em; font-size: 1em; }
    .teamHead { display: flex; align-items: center; gap: 0.6em; margin-top: 0.5em; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; }
    .teamName { font-size: 1.3em; font-weight: bold; }
    .teamRecord { font-size: 1.3em; color: var(--g555); }
    .verdict { max-width: 720px; font-size: 1.05em; }
    .tileGrid { display: flex; flex-wrap: wrap; gap: 0.6em; margin: 0.8em 0; }
    .tile { border: 1px solid var(--ddd); border-radius: 8px; padding: 0.6em 0.9em; min-width: 140px; flex: 1; max-width: 200px; }
    .tileVal { font-size: 1.4em; font-weight: bold; }
    .tileVal.hot { color: #c0392b; }
    .tileVal.cold { color: #2471a3; }
    .tileRank { font-size: 0.6em; color: var(--g555); font-weight: normal; }
    .tileLabel { font-size: 0.8em; color: var(--g555); }
    .edges { max-width: 560px; }
    .edgeRow { display: flex; align-items: center; gap: 0.6em; margin: 0.3em 0; }
    .edgePos { width: 30px; font-weight: bold; }
    .edgeTrack { position: relative; flex: 1; height: 18px; background: var(--f3f3f3); border-radius: 4px; }
    .edgeZero { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--g555); }
    .edgeBar { position: absolute; top: 3px; bottom: 3px; background: #2e86c1; border-radius: 3px; }
    .edgeBar.neg { background: #c0392b; }
    .edgeVal { width: 52px; text-align: right; font-variant-numeric: tabular-nums; }

    /* Dark mode: neutrals come from the theme variables above (they flip
       with the site's SMUI dark theme). Only accent colors need a brighter
       dark variant. */
    @media (prefers-color-scheme: dark) {
        .tileVal.hot { color: #e74c3c; }
        .tileVal.cold { color: #5dade2; }
        .edgeBar { background: #5dade2; }
        .edgeBar.neg { background: #e74c3c; }
        .tabBtn.active { border-bottom-color: #5dade2; }
    }
</style>
