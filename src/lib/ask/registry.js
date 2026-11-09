// The Ask registry: every thing the site can show or answer, in one
// place. This file is the single source of truth for BOTH the directory
// ("What's on this site") and the Ask bot's answers.
//
// Two rules keep answers correct as the site evolves (see PATTERNS.md):
//  1. A query's run() must call the SAME functions and loaders the pages
//     use — never re-derive a metric here. When a calculation changes,
//     the answer changes with it, automatically.
//  2. Adding a metric to the site means adding ONE entry here (plus its
//     test). If an answer can't be computed from an existing page
//     function, add the function to the page's module first, then call it.
//
// Entry kinds:
//  - page:  a place on the site (directory + "take me to" answers)
//  - query: a computed answer; run(ctx, params) returns
//           { headline, rows?, note?, href, hrefLabel }
//           rows are { label, value, sub? } in display order.
//  - guide: a curated answer pointing at other entries (sections with
//           entryIds the UI renders as buttons).

import { GO_OFF, goOffSplit } from '../utils/helperFunctions/recordAnatomyMath.js';

const fmt1 = (v) => `${v > 0 ? '+' : ''}${(Math.round(v * 10) / 10).toFixed(1)}`;
const fmt2 = (v) => (Math.round(v * 100) / 100).toFixed(2);

// Resolve the season a question is about: an explicit season wins, then
// the entry's default ('current' or 'all'), validated against the data.
const resolveSeason = (anatomy, params, fallback) => {
    if (params.season === 'all') return 'all';
    if (params.season && anatomy.seasons.includes(params.season)) return params.season;
    return fallback === 'all' ? 'all' : anatomy.currentYear;
};

const teamRows = (anatomy, nameFor, season, pick) => {
    if (season === 'all') {
        const byRoster = new Map();
        for (const t of Object.values(anatomy.teamSeasons)) {
            if (!byRoster.has(t.rosterID)) byRoster.set(t.rosterID, []);
            byRoster.get(t.rosterID).push(t);
        }
        return [...byRoster.entries()].map(([rosterID, mine]) => ({
            name: nameFor(anatomy.currentYear, rosterID),
            ...pick(mine),
        }));
    }
    return Object.values(anatomy.teamSeasons)
        .filter((t) => t.season === season)
        .map((t) => ({ name: nameFor(season, t.rosterID), ...pick([t]) }));
};

export const ENTRIES = [
    // ------------------------------------------------------------------
    // Computed answers
    // ------------------------------------------------------------------
    {
        id: 'luck', kind: 'query',
        params: ['season'], needs: ['anatomy'],
        title: 'Luckiest managers (wins vs all-play expected wins)',
        blurb: 'Actual wins minus the wins each team would expect if every team played every other team each week. Positive = the schedule handed them wins.',
        aliases: ['luckiest', 'luck', 'lucky', 'unluckiest', 'who is the luckiest', 'luck rankings', 'most lucky', 'least lucky'],
        keywords: ['luck', 'luckiest', 'expected', 'wins'],
        examples: ['Who is the luckiest manager?', 'Luck rankings 2025', 'Who has been unluckiest all time?'],
        run(ctx, params) {
            const season = resolveSeason(ctx.anatomy, params, 'all');
            const rows = teamRows(ctx.anatomy, ctx.nameFor, season, (mine) => ({
                wins: mine.reduce((s, t) => s + t.wins, 0),
                expected: mine.reduce((s, t) => s + t.expectedWins, 0),
                luck: mine.reduce((s, t) => s + t.luck, 0),
            }))
                .sort((a, b) => b.luck - a.luck)
                .map((r) => ({ label: r.name, value: fmt1(r.luck), sub: `${r.wins} wins vs ${fmt2(r.expected)} expected` }));
            return {
                headline: season === 'all' ? 'Luck, all time (2022–now)' : `Luck, ${season}`,
                rows,
                note: 'Luck = wins (ties count half) minus all-play expected wins.',
                href: `/h2h/luck${season === 'all' ? '' : `?season=${season}`}`,
                hrefLabel: 'See the Luck table',
            };
        },
    },
    {
        id: 'schedule-luck', kind: 'query',
        params: ['season'], needs: ['anatomy'],
        title: 'Schedule luck (opponents vs their own averages)',
        blurb: 'How far opponents\' scoring against each team ran from those opponents\' own season averages, per game. Positive = opponents kept no-showing against them.',
        aliases: ['schedule luck', 'sched luck', 'opponent luck', 'who has the easiest schedule', 'softest schedule', 'opponents underperform'],
        keywords: ['schedule', 'luck', 'opponents', 'soft'],
        examples: ['Who has the softest schedule in 2026?', 'Schedule luck rankings'],
        run(ctx, params) {
            const season = resolveSeason(ctx.anatomy, params, 'current');
            const rows = teamRows(ctx.anatomy, ctx.nameFor, season, (mine) => {
                const games = mine.reduce((s, t) => s + t.games, 0);
                return { schedLuck: games ? mine.reduce((s, t) => s + t.scheduleLuck * t.games, 0) / games : 0 };
            })
                .sort((a, b) => b.schedLuck - a.schedLuck)
                .map((r) => ({ label: r.name, value: `${fmt1(r.schedLuck)} pts/gm` }));
            return {
                headline: season === 'all' ? 'Schedule luck, all time' : `Schedule luck, ${season}`,
                rows,
                note: 'Positive = lucky: opponents scored that many fewer points per game against them than their own season average.',
                href: '/standings', hrefLabel: 'See SOS (Luck) on Standings',
            };
        },
    },
    {
        id: 'sos', kind: 'query',
        params: ['season'], needs: ['anatomy'],
        title: 'Toughest schedule (strength of schedule by points)',
        blurb: 'The average weekly score of the opponents each team has faced. Higher = a tougher road.',
        aliases: ['toughest schedule', 'hardest schedule', 'strongest schedule', 'strength of schedule', 'sos', 'easiest schedule', 'weakest schedule'],
        keywords: ['schedule', 'toughest', 'hardest', 'strongest', 'sos'],
        examples: ['Who has the toughest schedule in 2026?', 'Hardest schedule 2024'],
        run(ctx, params) {
            const season = resolveSeason(ctx.anatomy, params, 'current');
            const effSeason = season === 'all' ? ctx.anatomy.currentYear : season;
            const rows = teamRows(ctx.anatomy, ctx.nameFor, effSeason, (mine) => ({ sosPts: mine[0].sosPts }))
                .sort((a, b) => b.sosPts - a.sosPts)
                .map((r) => ({ label: r.name, value: fmt2(r.sosPts) }));
            return {
                headline: `Toughest schedules, ${effSeason} (opponents' avg weekly score)`,
                rows,
                href: effSeason === ctx.anatomy.currentYear ? '/standings' : `/h2h/anatomy?season=${effSeason}`,
                hrefLabel: effSeason === ctx.anatomy.currentYear ? 'See Standings' : 'See Record Anatomy',
            };
        },
    },
    {
        id: 'team-points', kind: 'query',
        params: ['season', 'topN'], needs: ['anatomy'],
        title: 'Most points by a team in a season',
        blurb: 'Total fantasy points scored by each team over a season (regular season).',
        aliases: ['most points', 'highest scoring team', 'most fantasy points team', 'top scoring team', 'points leaderboard team', 'who scored the most points'],
        keywords: ['points', 'scored', 'team', 'most'],
        examples: ['Who scored the most points in 2025?', 'Highest scoring team 2023'],
        run(ctx, params) {
            const season = resolveSeason(ctx.anatomy, params, 'current');
            const effSeason = season === 'all' ? ctx.anatomy.currentYear : season;
            const rows = teamRows(ctx.anatomy, ctx.nameFor, effSeason, (mine) => ({
                pts: mine[0].pointsFor, ppg: mine[0].pfPerGame,
            }))
                .sort((a, b) => b.pts - a.pts)
                .slice(0, params.topN || 16)
                .map((r) => ({ label: r.name, value: fmt2(r.pts), sub: `${fmt2(r.ppg)} per game` }));
            return {
                headline: `Team scoring, ${effSeason}`,
                rows,
                href: `/h2h/anatomy?season=${effSeason}`, hrefLabel: 'See Record Anatomy',
            };
        },
    },
    {
        id: 'player-points', kind: 'query',
        params: ['season', 'pos', 'topN'], needs: ['playerTotals', 'players', 'anatomy'],
        title: 'Most points by a player in a season',
        blurb: 'Total starter points by player over a season, in this league\'s scoring. Only weeks the player was started count.',
        aliases: ['most points player', 'highest scoring player', 'top players', 'player leaderboard', 'best player', 'who scored the most fantasy points', 'top fantasy players'],
        keywords: ['player', 'points', 'top', 'scored'],
        examples: ['Who scored the most fantasy points in 2025? Top 15', 'Top 10 RBs in 2024'],
        async run(ctx, params) {
            const season = params.season && params.season !== 'all' && ctx.anatomy.seasons.includes(params.season) ? params.season : ctx.anatomy.currentYear;
            const totals = await ctx.playerTotals(season);
            const rows = totals
                .filter((p) => !params.pos || (ctx.players[p.id]?.pos === params.pos))
                .slice(0, params.topN || 15)
                .map((p) => {
                    const info = ctx.players[p.id] || {};
                    return { label: `${info.fn || ''} ${info.ln || ''}`.trim() || `Player ${p.id}`, value: fmt2(p.points), sub: info.pos || '' };
                });
            return {
                headline: `Player scoring, ${season}${params.pos ? ` (${params.pos})` : ''} — starter points only`,
                rows,
                note: 'Points count only in weeks the player was in a starting lineup, under this league\'s scoring.',
                href: '/records', hrefLabel: 'See Records',
            };
        },
    },
    {
        id: 'go-off', kind: 'query',
        params: ['pos', 'threshold'], needs: ['anatomy'],
        title: 'Go-off splits (win rate when a position group goes off)',
        blurb: 'How often teams win when their own starters at a position group combine for at least the threshold. Thresholds are adjustable on the Stats page.',
        aliases: ['go off', 'goes off', 'going off', 'go-off', 'when your group goes off', 'position group win rate', 'rb go off'],
        keywords: ['off', 'group', 'win', 'rate'],
        examples: ['What happens when your RBs go off?', 'How often do you win when your QB scores 30+?'],
        run(ctx, params) {
            const groups = params.pos ? [params.pos] : ['QB', 'RB', 'WR', 'TE'];
            const rows = groups.map((pos) => {
                const threshold = params.threshold || GO_OFF[pos];
                const s = goOffSplit(ctx.anatomy.games, pos, threshold);
                return { label: `Your ${pos}s ${threshold}+`, value: `${s.hiWinPct}% win rate`, sub: `${s.hiN} games · vs ${s.loWinPct}% when they don't` };
            });
            const qs = groups.map((pos) => (params.threshold ? `${pos.toLowerCase()}=${params.threshold}` : null)).filter(Boolean).join('&');
            return {
                headline: 'When your group goes off, you win',
                rows,
                href: `/h2h/stats${qs ? `?${qs}` : ''}`, hrefLabel: 'Play with the sliders on Stats',
            };
        },
    },
    {
        id: 'ladder', kind: 'query',
        params: [], needs: ['anatomy'],
        title: 'The 20-point ladder',
        blurb: 'Win rate by how many of a team\'s starters score 20+ in a game.',
        aliases: ['20 point ladder', 'twenty point ladder', 'ladder', 'starters over 20', 'players over 20'],
        keywords: ['ladder', '20', 'starters'],
        examples: ['What does the 20-point ladder say?'],
        run(ctx) {
            const rows = ctx.anatomy.laws.ladder.map((r) => ({
                label: `${r.label} starters over 20`, value: `${r.winPct}% win rate`, sub: `${r.n} games`,
            }));
            return { headline: 'The 20-point ladder, all time', rows, href: '/h2h/stats', hrefLabel: 'See Stats' };
        },
    },
    {
        id: 'correlation', kind: 'query',
        params: [], needs: ['anatomy'],
        title: 'Points for vs points against: which drives winning?',
        blurb: 'Correlation between a team\'s scoring (or its opponents\' scoring) and its win percentage, by season.',
        aliases: ['points for or points against', 'pf vs pa', 'correlation', 'what drives winning', 'scoring or defense', 'does defense matter'],
        keywords: ['correlation', 'pf', 'pa', 'drives', 'winning'],
        examples: ['Does scoring or defense drive winning?', 'PF vs PA correlation'],
        run(ctx) {
            const rows = ctx.anatomy.laws.correlations.map((r) => ({
                label: `${r.season}`, value: `PF ${r.pf} · PA ${r.pa}`,
                sub: Math.abs(r.pf) >= Math.abs(r.pa) ? 'Scoring drives it' : 'Schedule drives it',
            }));
            return {
                headline: 'Correlation with win % (closer to ±1 = stronger)',
                rows,
                note: 'Points For is the stronger driver in every season on record.',
                href: '/h2h/stats', hrefLabel: 'See Stats',
            };
        },
    },
    {
        id: 'anatomy', kind: 'query',
        params: ['season', 'manager'], needs: ['anatomy'],
        title: "A team's record, dissected",
        blurb: 'One team, one season: record vs expected wins, luck, schedule strength, and positional edges vs the league average.',
        aliases: ['record anatomy', 'anatomy of a record', 'team breakdown', 'how good is', 'season breakdown'],
        keywords: ['anatomy', 'record', 'breakdown', 'team'],
        examples: ['Break down Jake\'s 2026 season', 'Anatomy of Vinnie\'s record'],
        run(ctx, params) {
            const season = resolveSeason(ctx.anatomy, params, 'current');
            const effSeason = season === 'all' ? ctx.anatomy.currentYear : season;
            const teams = Object.values(ctx.anatomy.teamSeasons).filter((t) => t.season === effSeason);
            const team = params.manager
                ? teams.find((t) => ctx.nameFor(effSeason, t.rosterID) === params.manager)
                : teams.slice().sort((a, b) => Math.abs(b.luck) - Math.abs(a.luck))[0];
            if (!team) return { headline: `No team found for ${effSeason}`, rows: [], href: `/h2h/anatomy?season=${effSeason}`, hrefLabel: 'See Record Anatomy' };
            const name = ctx.nameFor(effSeason, team.rosterID);
            return {
                headline: `${name}, ${effSeason}`,
                rows: [
                    { label: 'Record', value: `${team.wins} wins`, sub: `${fmt2(team.expectedWins)} expected · luck ${fmt1(team.luck)}` },
                    { label: 'Points For / game', value: fmt2(team.pfPerGame), sub: `#${team.pfRank} of ${teams.length}` },
                    { label: 'Points Against / game', value: fmt2(team.paPerGame), sub: `#${team.paRank} of ${teams.length}` },
                    { label: 'Schedule Luck', value: `${fmt1(team.scheduleLuck)} pts/gm`, sub: `#${team.scheduleLuckRank} luckiest` },
                    ...['QB', 'RB', 'WR', 'TE'].map((pos) => ({ label: `${pos} edge vs league avg`, value: `${fmt1(team.edges[pos])} pts/gm` })),
                ],
                href: `/h2h/anatomy?season=${effSeason}&team=${team.rosterID}`, hrefLabel: `See ${name}'s anatomy`,
            };
        },
    },

    {
        id: 'best-drafter', kind: 'query', needs: ['combined'], params: [],
        title: 'Best at drafting (draft picks ranked by what they produced)',
        blurb: 'Managers ranked by the total starter points their draft picks produced — the Draft Analysis numbers, rolled up per manager.',
        aliases: ['best at drafting', 'best drafter', 'best draft', 'drafting', 'who drafts best', 'best at the draft', 'worst drafter', 'draft king', 'best drafting'],
        keywords: ['drafting', 'drafter', 'draft'],
        examples: ['Best at drafting', 'Who is the best drafter?'],
        run(ctx) {
            const rows = [...(ctx.combined || [])]
                .sort((a, b) => (b.draftTotalPts || 0) - (a.draftTotalPts || 0))
                .map((r) => ({
                    label: r.manager,
                    value: `${Math.round(r.draftTotalPts || 0)} pts`,
                    sub: `#${r.draftRank} · ${(r.draftAvgPtsPerPick || 0).toFixed(1)} per pick`,
                }));
            return {
                headline: 'Best at drafting (starter points from draft picks, all seasons in the data)',
                rows,
                href: '/manager_overview/leaderboard', hrefLabel: 'See Manager Overview',
            };
        },
    },
    {
        id: 'best-trader', kind: 'query', needs: ['combined'], params: [],
        title: 'Best at trading (net starter points gained in trades)',
        blurb: 'Managers ranked by net starter-point surplus from completed trades: what they received minus what they gave up, post-trade points only.',
        aliases: ['best at trading', 'best trader', 'best trades', 'who trades best', 'trade king', 'worst trader', 'best at trades'],
        keywords: ['trading', 'trader', 'trades'],
        examples: ['Best at trading', 'Who is the best trader?'],
        run(ctx) {
            const rows = [...(ctx.combined || [])]
                .sort((a, b) => (b.netTradeSurplus || 0) - (a.netTradeSurplus || 0))
                .map((r) => ({
                    label: r.manager,
                    value: `${fmt1(r.netTradeSurplus || 0)} pts`,
                    sub: `#${r.tradeRank} · ${r.tradeCount || 0} trades`,
                }));
            return {
                headline: 'Best at trading (net starter points gained, post-trade only)',
                rows,
                href: '/manager_overview/leaderboard', hrefLabel: 'See Manager Overview',
            };
        },
    },
    {
        id: 'best-manager', kind: 'query', needs: ['combined'], params: [],
        title: 'Best all-around manager (average of cap, trade, and draft ranks)',
        blurb: 'The Manager Overview leaderboard: each manager\'s average rank across cap efficiency, trade outcomes, and draft output. Lower is better.',
        aliases: ['best manager', 'best all around', 'best overall manager', 'manager leaderboard', 'top manager', 'best gm'],
        keywords: ['manager', 'best', 'overall', 'leaderboard'],
        examples: ['Who is the best all-around manager?'],
        run(ctx) {
            const rows = [...(ctx.combined || [])]
                .sort((a, b) => (a.avgRank ?? 99) - (b.avgRank ?? 99))
                .map((r) => ({
                    label: r.manager,
                    value: `avg rank ${(r.avgRank || 0).toFixed(1)}`,
                    sub: `Cap #${r.capRank} · Trades #${r.tradeRank} · Draft #${r.draftRank}`,
                }));
            return {
                headline: 'Best all-around manager (average rank: cap, trades, draft)',
                rows,
                href: '/manager_overview/leaderboard', hrefLabel: 'See Manager Overview',
            };
        },
    },

    // ------------------------------------------------------------------
    // Guides
    // ------------------------------------------------------------------
    {
        id: 'directory', kind: 'guide',
        title: "What's on this site?",
        blurb: 'Every stat and page, in plain English.',
        aliases: ['what stats do we have', 'what is on this site', 'whats on this site', 'list of stats', 'all the stats', 'directory', 'what can i look at', 'site map', 'sitemap'],
        keywords: ['what', 'stats', 'site', 'have'],
        examples: ['What stats do we have on the site?'],
        showDirectory: true,
    },
    {
        id: 'know-ball', kind: 'guide',
        title: 'What stats tell me if I know ball?',
        blurb: 'The skill-vs-luck shelf: the numbers that separate earned wins from gifted ones, and the pages that grade drafting and trading.',
        aliases: ['know ball', 'do i know ball', 'skill vs luck', 'am i good', 'how do i know if i am good', 'earned wins', 'actually good'],
        keywords: ['ball', 'skill', 'good'],
        examples: ['What stats tell me if I know ball?'],
        sections: [
            { text: 'Start with luck vs expected wins. If your wins track your all-play expected wins, they\'re earned; a big gap either way is the schedule talking.', entryId: 'luck' },
            { text: 'Schedule luck tells you whether opponents kept having their worst weeks against you.', entryId: 'schedule-luck' },
            { text: 'Draft Analysis grades every pick by what it produced after the draft — the cleanest "knows ball" evidence there is.', entryId: 'page-draft-analysis' },
            { text: 'Or skip straight to the roll-up: who is best at drafting, by total starter points their picks produced.', entryId: 'best-drafter' },
            { text: 'Trade Analysis scores every completed trade by post-trade starter points, for and against.', entryId: 'page-trade-analysis' },
            { text: 'Manager Overview rolls cap, trades, and draft into one leaderboard with an average rank per manager.', entryId: 'page-manager-overview' },
        ],
    },

    // ------------------------------------------------------------------
    // Pages (the directory)
    // ------------------------------------------------------------------
    { id: 'page-standings', kind: 'page', group: 'League', title: 'Standings', blurb: 'Records, points, all three strength-of-schedule flavors, and luck — sortable.', href: '/standings', aliases: ['standings', 'records table', 'league table'], keywords: ['standings'] },
    { id: 'page-rosters', kind: 'page', group: 'League', title: 'Rosters', blurb: 'Every roster, starters and bench.', href: '/rosters', aliases: ['rosters', 'teams', 'who owns'], keywords: ['rosters'] },
    { id: 'page-rivalry', kind: 'page', group: 'League', title: 'Rivalry', blurb: 'Head-to-head history between any two managers.', href: '/rivalry', aliases: ['rivalry', 'head to head', 'h2h record', 'versus'], keywords: ['rivalry'] },
    { id: 'page-matchups', kind: 'page', group: 'Start', title: 'Matchups', blurb: 'This week\'s games and scores.', href: '/matchups', aliases: ['matchups', 'this week', 'scores'], keywords: ['matchups'] },
    { id: 'page-transactions', kind: 'page', group: 'Start', title: 'Trades & Waivers', blurb: 'Every trade, waiver claim, and free-agent move.', href: '/transactions', aliases: ['transactions', 'waivers', 'trades and waivers', 'recent moves'], keywords: ['transactions', 'waivers'] },
    { id: 'page-player-values', kind: 'page', group: 'Cap', title: 'Player Values', blurb: 'The frozen salary-cap value of every player, by season.', href: '/cap', aliases: ['player values', 'cap values', 'player prices', 'what is he worth', 'salary'], keywords: ['values', 'cap'] },
    { id: 'page-team-values', kind: 'page', group: 'Cap', title: 'Team Values', blurb: 'Each team\'s total cap number, who is over the $600 cap, and the luxury tax owed.', href: '/team_values', aliases: ['team values', 'cap space', 'over the cap', 'luxury tax', 'who is over'], keywords: ['cap', 'tax', 'over'] },
    { id: 'page-calculator', kind: 'page', group: 'Cap', title: 'Cap Trade Calculator', blurb: 'Test whether a trade keeps both sides under the cap.', href: '/calculator', aliases: ['trade calculator', 'cap calculator', 'calculator'], keywords: ['calculator'] },
    { id: 'page-cap-analysis', kind: 'page', group: 'Analytics', title: 'Cap Analysis', blurb: 'How each manager allocates cap by position, cap efficiency, and spending trends.', href: '/cap_analysis/allocation', aliases: ['cap analysis', 'cap efficiency', 'spending'], keywords: ['cap', 'analysis'] },
    { id: 'page-trade-analysis', kind: 'page', group: 'Analytics', title: 'Trade Analysis', blurb: 'Every trade scored by post-trade starter points — by team, position, player, or the full log.', href: '/trade_analysis/team', aliases: ['trade analysis', 'trade grades', 'who won the trade', 'best trades', 'worst trades'], keywords: ['trade', 'analysis'] },
    { id: 'page-draft-analysis', kind: 'page', group: 'Analytics', title: 'Draft Analysis', blurb: 'Every draft pick graded by the starter points it produced.', href: '/draft_analysis/team', aliases: ['draft analysis', 'draft grades', 'best draft', 'draft picks'], keywords: ['draft', 'analysis'] },
    { id: 'page-manager-overview', kind: 'page', group: 'Analytics', title: 'Manager Overview', blurb: 'Leaderboard, radar, and cards rolling cap, trades, and draft into one view per manager.', href: '/manager_overview/leaderboard', aliases: ['manager overview', 'best manager', 'manager rankings', 'leaderboard'], keywords: ['manager', 'overview'] },
    { id: 'page-h2h-luck', kind: 'page', group: 'Analytics', title: 'H2H: Luck Over Time', blurb: 'Luck and schedule luck by team and season — the luck tables.', href: '/h2h/luck', aliases: ['luck over time', 'h2h luck', 'luck table'], keywords: ['luck', 'h2h'] },
    { id: 'page-h2h-anatomy', kind: 'page', group: 'Analytics', title: 'H2H: Anatomy of a Record', blurb: 'Any team-season dissected: expected wins, schedule, positional edges.', href: '/h2h/anatomy', aliases: ['anatomy page', 'record anatomy page'], keywords: ['anatomy', 'h2h'] },
    { id: 'page-h2h-stats', kind: 'page', group: 'Analytics', title: 'H2H: Stats', blurb: 'Point correlation, go-off splits with adjustable sliders, and the 20-point ladder.', href: '/h2h/stats', aliases: ['h2h stats', 'stats page', 'go off page', 'laws of the league'], keywords: ['stats', 'h2h'] },
    { id: 'page-drafts', kind: 'page', group: 'History', title: 'Drafts', blurb: 'Full draft boards from every season.', href: '/drafts', aliases: ['drafts', 'draft boards', 'past drafts'], keywords: ['drafts'] },
    { id: 'page-records', kind: 'page', group: 'History', title: 'Records', blurb: 'League records: biggest weeks, best seasons, and more.', href: '/records', aliases: ['records', 'all time records', 'biggest week'], keywords: ['records'] },
    { id: 'page-trophy', kind: 'page', group: 'History', title: 'Trophy Room', blurb: 'Champions and award winners.', href: '/awards', aliases: ['trophy room', 'champions', 'awards', 'winners'], keywords: ['trophy', 'awards'] },
    { id: 'page-lottery', kind: 'page', group: 'Commish', title: 'Draft Lottery', blurb: 'The lottery odds and the wheel for the bottom six picks.', href: '/lottery', aliases: ['lottery', 'draft lottery', 'lottery odds', 'the wheel'], keywords: ['lottery'] },
    { id: 'page-schedule', kind: 'page', group: 'Commish', title: 'Schedule', blurb: 'How the season schedule is built.', href: '/schedule', aliases: ['schedule page', 'schedule builder'], keywords: ['schedule'] },
    { id: 'page-constitution', kind: 'page', group: 'Commish', title: 'Constitution', blurb: 'The league constitution — cap, tax, lottery, and rules.', href: '/constitution', aliases: ['constitution', 'rules', 'league rules', 'the rules'], keywords: ['constitution', 'rules'] },
    { id: 'page-conditional', kind: 'page', group: 'Commish', title: 'Conditional Trades', blurb: 'The registry of trades with conditions attached to picks.', href: '/conditional', aliases: ['conditional trades', 'conditions', 'conditional picks'], keywords: ['conditional'] },
    { id: 'page-sidebets', kind: 'page', group: 'More', title: 'Side Bets', blurb: 'The league\'s side bet ledger.', href: '/sidebets', aliases: ['side bets', 'bets', 'side bet'], keywords: ['bets'] },
    { id: 'page-managers', kind: 'page', group: 'League', title: 'Managers', blurb: 'The 16 managers and their teams.', href: '/managers', aliases: ['managers', 'owners', 'the managers'], keywords: ['managers'] },
];

export const entryById = (id) => ENTRIES.find((e) => e.id === id);
export const queryEntries = () => ENTRIES.filter((e) => e.kind === 'query');
export const pageEntries = () => ENTRIES.filter((e) => e.kind === 'page');
