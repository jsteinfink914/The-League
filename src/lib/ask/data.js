// Lazy, cached data loaders for the Ask page. Each registry query
// declares what it needs; only that data is loaded, and only once per
// page session. Everything comes from the same loaders the site's pages
// use, so Ask answers can never drift from the pages they point to.
import { getRecordAnatomy } from '$lib/utils/helperFunctions/recordAnatomy';
import { getLeagueTeamManagers } from '$lib/utils/helperFunctions/leagueTeamManagers';
import { loadPlayers } from '$lib/utils/helperFunctions/players';
import { managers as leagueManagers, leagueID } from '$lib/utils/leagueInfo';
import { aggregatePlayerTotals } from './playerTotals.js';
import { fetchJson, fetchJsonCached, allSettledWithConcurrency } from '$lib/utils/helperFunctions/request';
import { loadManagerOverviewData } from '$lib/utils/helperFunctions/managerOverviewData';

let anatomyPromise = null;
let overviewPromise = null;
let capEffPromise = null;
let managersPromise = null;
let playersPromise = null;
const totalsPromises = {};

export const loadAnatomy = () => (anatomyPromise ??= getRecordAnatomy());
// The full Manager Overview pipeline result ({ capData, tradeData,
// draftData, combined }) — one load, shared by every consumer. The
// builders inside it are the same ones the Trade/Draft/Cap Analysis
// and Manager Overview pages run.
export const loadOverview = () => (overviewPromise ??= loadManagerOverviewData());
export const loadCombined = () => loadOverview().then((d) => d.combined || []);

// Cap efficiency rows, assembled exactly like the Cap Analysis page:
// historical player rows from static/cap-history.json plus the live
// current-year playerEfficiency rows (tagged with the current year),
// and the per-team seasonTrends (which include the current year).
export const loadCapEfficiency = () => (capEffPromise ??= (async () => {
    const overview = await loadOverview();
    const capData = overview.capData || {};
    let playerHistory = [];
    try {
        const res = await fetch('/cap-history.json');
        if (res.ok) {
            const histJson = await res.json();
            if (Array.isArray(histJson.playerHistory)) playerHistory = histJson.playerHistory;
        }
    } catch (e) { console.warn('[Ask] cap-history.json not available:', e.message); }
    const playerRows = [
        ...playerHistory,
        ...(capData.playerEfficiency || []).map((p) => ({ ...p, year: capData.currentYear })),
    ];
    return { playerRows, seasonTrends: capData.seasonTrends || [], currentYear: capData.currentYear };
})());
export const loadManagers = () => (managersPromise ??= getLeagueTeamManagers());
export const loadPlayersMap = () => (playersPromise ??= loadPlayers().then((r) => r.players || {}));

// rosterID -> canonical manager name for a season, falling back to the
// most recent season that roster appears in (same spirit as the H2H
// pages' name resolution).
export const buildNameFor = (teamManagers) => {
    const canonicalByID = {};
    for (const m of leagueManagers) canonicalByID[m.managerID] = m.name;
    const map = teamManagers?.teamManagersMap || {};
    const yearsDesc = Object.keys(map).map(Number).sort((a, b) => b - a);
    return (season, rosterID) => {
        for (const year of [season, ...yearsDesc]) {
            const entry = map[year]?.[rosterID];
            const mid = entry?.managers?.[0];
            if (mid && canonicalByID[mid]) return canonicalByID[mid];
            if (mid && teamManagers.users?.[mid]?.display_name) return teamManagers.users[mid].display_name;
        }
        return `Team ${rosterID}`;
    };
};

// Season player totals (starter points, league scoring) from Sleeper
// matchup data — the same source the rest of the site reads.
export const loadPlayerTotals = (season) => {
    if (totalsPromises[season]) return totalsPromises[season];
    totalsPromises[season] = (async () => {
        // Walk the league chain to find this season's league.
        let leagueId = null;
        let current = leagueID;
        const seen = new Set();
        let playoffStart = 15;
        while (current && !seen.has(current)) {
            seen.add(current);
            const league = await fetchJsonCached(`https://api.sleeper.app/v1/league/${current}`);
            if (Number(league.season) === Number(season)) {
                leagueId = current;
                playoffStart = league.settings?.playoff_week_start || 15;
                break;
            }
            current = league.previous_league_id;
        }
        if (!leagueId) return [];
        let lastWeek = playoffStart - 1;
        const state = await fetchJson('https://api.sleeper.app/v1/state/nfl').catch(() => null);
        if (state && Number(state.season) === Number(season) && state.season_type === 'regular') {
            lastWeek = Math.min(lastWeek, Math.max(state.week - 1, 0));
        }
        const urls = [];
        for (let w = 1; w <= lastWeek; w++) {
            urls.push(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${w}`);
        }
        const results = await allSettledWithConcurrency(urls.map((url) => () => fetchJsonCached(url)));
        const failed = results.find((r) => r.status === 'rejected');
        if (failed) throw failed.reason;
        return aggregatePlayerTotals(results.map((r) => r.value));
    })();
    return totalsPromises[season];
};

// Assemble the ctx a registry query runs against, loading only the
// datasets in `needs`.
export const buildContext = async (needs) => {
    const ctx = {};
    const jobs = [];
    if (needs.includes('anatomy')) jobs.push(loadAnatomy().then((a) => { ctx.anatomy = a; }));
    if (needs.includes('anatomy') || needs.includes('players')) {
        jobs.push(loadManagers().then((m) => { ctx.nameFor = buildNameFor(m); }));
    }
    if (needs.includes('players')) jobs.push(loadPlayersMap().then((p) => { ctx.players = p; }));
    if (needs.includes('playerTotals')) ctx.playerTotals = loadPlayerTotals;
    if (needs.includes('combined')) jobs.push(loadCombined().then((c) => { ctx.combined = c; }));
    if (needs.includes('overview')) jobs.push(loadOverview().then((o) => { ctx.overview = o; ctx.combined = o.combined || []; }));
    if (needs.includes('capEff')) jobs.push(loadCapEfficiency().then((c) => { ctx.capEff = c; }));
    await Promise.all(jobs);
    if (!ctx.nameFor) ctx.nameFor = (_s, rosterID) => `Team ${rosterID}`;
    return ctx;
};
