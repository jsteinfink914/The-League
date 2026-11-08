<script>
    import { onMount } from 'svelte';
    import { getRecordAnatomy } from '$lib/utils/helperFunctions/recordAnatomy';

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
            selectedSeason = data.currentYear;
            selectedRoster = defaultRoster(selectedSeason);
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
    $: luckRows = data ? buildLuckRows(luckSeason) : [];
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
                    };
                })
                .sort((a, b) => b.luck - a.luck);
        }
        const season = Number(sel);
        return Object.values(data.teamSeasons)
            .filter((t) => t.season === season)
            .map((t) => ({ name: teamName(season, t.rosterID), wins: t.wins, expectedWins: t.expectedWins, luck: t.luck }))
            .sort((a, b) => b.luck - a.luck);
    };

    const changeSeason = () => { selectedRoster = defaultRoster(selectedSeason); };

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
        <div class="splitGrid">
            {#each data.laws.splits as s}
                <div class="splitCard">
                    <div class="splitTitle">Your {s.pos}s score <strong class="splitThreshold">{s.threshold}+</strong></div>
                    <div class="splitBig">{s.hiWinPct}% <span class="splitLabel">win rate</span></div>
                    <div class="splitSub">vs {s.loWinPct}% when they don't · {s.hiN} games</div>
                </div>
            {/each}
        </div>
        <table class="dataTable">
            <thead>
                <tr><th>Season</th>{#each data.laws.splits as s}<th>Your {s.pos} <strong>{s.threshold}+</strong></th>{/each}</tr>
            </thead>
            <tbody>
                {#each data.laws.splitsBySeason as row}
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

    <section>
        <h3>Luck Over Time</h3>
        <div class="selectors">
            <label>Season
                <select bind:value={luckSeason}>
                    <option value="all">All-time</option>
                    {#each data.seasons as s}<option value={s}>{s}</option>{/each}
                </select>
            </label>
        </div>
        <p class="note">Actual wins minus all-play expected wins — positive means the schedule handed them wins, negative means their scoring deserved better. Sorted by luck.</p>
        <table class="dataTable">
            <thead>
                <tr><th>Team</th><th>Wins</th><th>Exp. Wins</th><th>Luck</th></tr>
            </thead>
            <tbody>
                {#each luckRows as row}
                    <tr><td>{row.name}</td><td>{fmtWins(row.wins)}</td><td>{fmt2(row.expectedWins)}</td><td><strong>{fmtLuck(row.luck)}</strong></td></tr>
                {/each}
            </tbody>
        </table>
    </section>

    <section>
        <h2>Anatomy of a Record</h2>
        <div class="selectors">
            <label>Season
                <select bind:value={selectedSeason} on:change={changeSeason}>
                    {#each data.seasons as season}<option value={season}>{season}</option>{/each}
                </select>
            </label>
            <label>Team
                <select bind:value={selectedRoster}>
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

<style>
    h1 { font-size: 2.2em; line-height: 1.3em; margin: 1.5em 0 0.3em; }
    h2 { margin: 1.3em 0 0.35em; }
    h3 { margin: 1.1em 0 0.35em; }
    .intro { max-width: 720px; }
    .note { font-size: 0.85em; font-style: italic; color: #555; max-width: 720px; }
    .note.inline { font-size: 0.75em; font-weight: normal; }
    .loading { display: block; margin: 80px auto; text-align: center; }
    section { margin-bottom: 1.6em; }
    .dataTable { border-collapse: collapse; width: 100%; max-width: 720px; margin: 0.4em 0 0.8em; }
    .dataTable th, .dataTable td { border: 1px solid #ddd; padding: 0.35em 0.55em; text-align: left; font-size: 0.95em; }
    .dataTable th { background: #f4f4f4; }
    .dataTable tr.pooled { font-weight: bold; background: #fafafa; }
    .splitGrid { display: flex; flex-wrap: wrap; gap: 0.6em; margin: 0.4em 0 0.8em; }
    .splitCard { border: 1px solid #ddd; border-radius: 8px; padding: 0.6em 0.85em; min-width: 150px; flex: 1; max-width: 220px; }
    .splitTitle { font-size: 0.85em; color: #555; }
    .splitThreshold { font-size: 1.35em; color: #222; }
    .splitBig { font-size: 1.6em; font-weight: normal; margin: 0.15em 0; }
    .gamesN { color: #555; font-size: 0.85em; }
    .splitLabel { font-size: 0.5em; font-weight: normal; color: #555; }
    .splitSub { font-size: 0.8em; color: #555; }
    .selectors { display: flex; gap: 1em; margin: 0.5em 0 1em; flex-wrap: wrap; }
    .selectors select { margin-left: 0.4em; padding: 0.3em; font-size: 1em; }
    .teamHead { display: flex; align-items: center; gap: 0.6em; margin-top: 0.5em; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; }
    .teamName { font-size: 1.3em; font-weight: bold; }
    .teamRecord { font-size: 1.3em; color: #555; }
    .verdict { max-width: 720px; font-size: 1.05em; }
    .tileGrid { display: flex; flex-wrap: wrap; gap: 0.6em; margin: 0.8em 0; }
    .tile { border: 1px solid #ddd; border-radius: 8px; padding: 0.6em 0.9em; min-width: 140px; flex: 1; max-width: 200px; }
    .tileVal { font-size: 1.4em; font-weight: bold; }
    .tileVal.hot { color: #c0392b; }
    .tileVal.cold { color: #2471a3; }
    .tileRank { font-size: 0.6em; color: #555; font-weight: normal; }
    .tileLabel { font-size: 0.8em; color: #555; }
    .edges { max-width: 560px; }
    .edgeRow { display: flex; align-items: center; gap: 0.6em; margin: 0.3em 0; }
    .edgePos { width: 30px; font-weight: bold; }
    .edgeTrack { position: relative; flex: 1; height: 18px; background: #f4f4f4; border-radius: 4px; }
    .edgeZero { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #999; }
    .edgeBar { position: absolute; top: 3px; bottom: 3px; background: #2e86c1; border-radius: 3px; }
    .edgeBar.neg { background: #c0392b; }
    .edgeVal { width: 52px; text-align: right; font-variant-numeric: tabular-nums; }

    /* Dark mode: follow the OS setting, same as the site's SMUI dark theme. */
    @media (prefers-color-scheme: dark) {
        .note, .splitTitle, .splitSub, .splitLabel, .teamRecord, .tileRank, .tileLabel, .gamesN { color: #aaa; }
        .splitThreshold { color: #eee; }
        .dataTable th, .dataTable td { border-color: #444; }
        .dataTable th { background: #1e1e1e; }
        .dataTable tr.pooled { background: #242424; }
        .splitCard, .tile { border-color: #444; }
        .edgeTrack { background: #1e1e1e; }
        .edgeZero { background: #777; }
        .tileVal.hot { color: #e74c3c; }
        .tileVal.cold { color: #5dade2; }
        .edgeBar { background: #5dade2; }
        .edgeBar.neg { background: #e74c3c; }
    }
</style>
