// Composable datasets for Ask: typed views over tables the site
// already computes. The router may answer with a PLAN against one
// dataset (filters / rankBy / sort / limit) instead of a fixed
// registry entry — that's what makes transform questions ("rank by
// draft only", "exclude cap", "unluckiest in 2025") answerable
// without new code per phrasing. Plans are validated in llmRoute.js
// (validatePlan); this module owns the specs and the deterministic
// executor. The model never sees row data — only the catalog
// description of each spec (buildDatasetCatalog).
import { fmt1, fmt2, resolveSeason, teamRows } from './registry.js';
import { aggregateMostTradedPlayers } from '../utils/helperFunctions/mostTradedMath.js';

const avgOf = (row, fields) => fields.reduce((sum, f) => sum + (row[f] ?? 99), 0) / fields.length;
const fmtPts = (v) => `${Math.round((v || 0) * 10) / 10}`;

export const DATASETS = [
    {
        id: 'manager-leaderboard',
        description: 'One row per manager with Manager Overview component ranks. Rank by any subset of the components (average of the chosen ranks, lower is better).',
        needs: ['combined'],
        filters: { manager: 'manager' },
        components: {
            cap: { field: 'capRank', label: 'cap efficiency', short: 'Cap' },
            trades: { field: 'tradeRank', label: 'trades', short: 'Trades' },
            draft: { field: 'draftRank', label: 'draft', short: 'Draft' },
        },
        examples: [
            { dataset: 'manager-leaderboard', rankBy: ['trades', 'draft'] },
            { dataset: 'manager-leaderboard', rankBy: ['draft'] },
        ],
        execute(ctx, plan) {
            const chosen = plan.rankBy?.length ? plan.rankBy : Object.keys(this.components);
            const fields = chosen.map((k) => this.components[k].field);
            let rows = [...(ctx.combined || [])];
            if (plan.filters?.manager) rows = rows.filter((r) => r.manager === plan.filters.manager);
            const out = rows
                .map((r) => ({ r, score: avgOf(r, fields) }))
                .sort((a, b) => a.score - b.score || a.r.manager.localeCompare(b.r.manager))
                .map(({ r, score }) => ({
                    label: r.manager,
                    value: `avg rank ${score.toFixed(1)}`,
                    sub: chosen.map((k) => `${this.components[k].short} #${r[this.components[k].field]}`).join(' · '),
                }));
            const excluded = Object.keys(this.components).filter((k) => !chosen.includes(k));
            return {
                headline: `Manager leaderboard — ranked by ${chosen.map((k) => this.components[k].label).join(' + ')}${excluded.length ? ` (${excluded.map((k) => this.components[k].label).join(', ')} excluded)` : ''}`,
                rows: out,
                href: '/manager_overview/leaderboard', hrefLabel: 'See Manager Overview',
            };
        },
    },
    {
        id: 'player-totals',
        description: 'Individual players by total starter points (league scoring). Filter by season (a year, or "all" to sum every season) and position.',
        needs: ['playerTotals', 'players', 'anatomy'],
        filters: { season: 'season', pos: 'pos' },
        sorts: ['points'],
        examples: [
            { dataset: 'player-totals', filters: { season: 2025, pos: 'RB' }, limit: 5 },
            { dataset: 'player-totals', filters: { season: 'all' }, limit: 10 },
        ],
        async execute(ctx, plan) {
            const season = plan.filters?.season;
            let totals;
            let seasonLabel;
            if (season === 'all') {
                const byId = new Map();
                for (const s of ctx.anatomy.seasons) {
                    for (const p of await ctx.playerTotals(s)) {
                        byId.set(p.id, (byId.get(p.id) || 0) + p.points);
                    }
                }
                totals = [...byId.entries()].map(([id, points]) => ({ id, points }));
                seasonLabel = 'all time';
            } else {
                const eff = season && ctx.anatomy.seasons.includes(season) ? season : ctx.anatomy.currentYear;
                totals = await ctx.playerTotals(eff);
                seasonLabel = String(eff);
            }
            const rows = totals
                .filter((p) => !plan.filters?.pos || ctx.players[p.id]?.pos === plan.filters.pos)
                .sort((a, b) => b.points - a.points)
                .slice(0, plan.limit || 15)
                .map((p) => {
                    const info = ctx.players[p.id] || {};
                    return { label: `${info.fn || ''} ${info.ln || ''}`.trim() || `Player ${p.id}`, value: fmt2(p.points), sub: info.pos || '' };
                });
            return {
                headline: `Player totals — ${seasonLabel}${plan.filters?.pos ? `, ${plan.filters.pos}` : ''}, by starter points`,
                rows,
                note: 'Points count only in weeks the player was in a starting lineup, under this league\'s scoring.',
                href: '/records', hrefLabel: 'See Records',
            };
        },
    },
    {
        id: 'team-totals',
        description: 'Total points scored by each team in one season (regular season).',
        needs: ['anatomy'],
        filters: { season: 'season', manager: 'manager' },
        sorts: ['pointsFor'],
        examples: [{ dataset: 'team-totals', filters: { season: 2025 } }],
        execute(ctx, plan) {
            const season = resolveSeason(ctx.anatomy, plan.filters || {}, 'current');
            const eff = season === 'all' ? ctx.anatomy.currentYear : season;
            let rows = teamRows(ctx.anatomy, ctx.nameFor, eff, (mine) => ({ pts: mine[0].pointsFor, ppg: mine[0].pfPerGame }));
            if (plan.filters?.manager) rows = rows.filter((r) => r.name === plan.filters.manager);
            const out = rows
                .sort((a, b) => b.pts - a.pts)
                .slice(0, plan.limit || 16)
                .map((r) => ({ label: r.name, value: fmt2(r.pts), sub: `${fmt2(r.ppg)} per game` }));
            return {
                headline: `Team totals — ${eff}, by points scored`,
                rows: out,
                href: `/h2h/anatomy?season=${eff}`, hrefLabel: 'See Record Anatomy',
            };
        },
    },
    {
        id: 'luck',
        description: 'Wins minus all-play expected wins per manager, for one season or all time. Sort ascending for the unluckiest.',
        needs: ['anatomy'],
        filters: { season: 'season', manager: 'manager' },
        sorts: ['luck'],
        examples: [
            { dataset: 'luck', filters: { season: 'all' } },
            { dataset: 'luck', filters: { season: 2025 }, sortBy: 'luck', sortDir: 'asc' },
        ],
        execute(ctx, plan) {
            const season = resolveSeason(ctx.anatomy, plan.filters || {}, 'all');
            let rows = teamRows(ctx.anatomy, ctx.nameFor, season, (mine) => ({
                wins: mine.reduce((s, t) => s + t.wins, 0),
                expected: mine.reduce((s, t) => s + t.expectedWins, 0),
                luck: mine.reduce((s, t) => s + t.luck, 0),
            }));
            if (plan.filters?.manager) rows = rows.filter((r) => r.name === plan.filters.manager);
            const dir = plan.sortDir === 'asc' ? 1 : -1;
            const out = rows
                .sort((a, b) => dir * (a.luck - b.luck))
                .slice(0, plan.limit || 16)
                .map((r) => ({ label: r.name, value: fmt1(r.luck), sub: `${r.wins} wins vs ${fmt2(r.expected)} expected` }));
            return {
                headline: `Luck — ${season === 'all' ? 'all time' : season}, ${dir === 1 ? 'unluckiest first' : 'luckiest first'}`,
                rows: out,
                note: 'Luck = wins (ties count half) minus all-play expected wins.',
                href: '/h2h/luck', hrefLabel: 'See the Luck table',
            };
        },
    },
    {
        id: 'player-seasons',
        description: 'Individual player SEASONS: one row per player per season, ranked by that season\'s starter points. Use for "best RB seasons ever" (single-season performances) — unlike player-totals, seasons are never summed together.',
        needs: ['playerTotals', 'players', 'anatomy'],
        filters: { season: 'season', pos: 'pos' },
        sorts: ['points'],
        examples: [
            { dataset: 'player-seasons', filters: { season: 'all', pos: 'RB' }, limit: 5 },
            { dataset: 'player-seasons', filters: { season: 2024 } },
        ],
        async execute(ctx, plan) {
            const season = plan.filters?.season;
            const seasons = season && season !== 'all' && ctx.anatomy.seasons.includes(season)
                ? [season]
                : ctx.anatomy.seasons;
            let rows = [];
            for (const s of seasons) {
                for (const p of await ctx.playerTotals(s)) rows.push({ id: p.id, points: p.points, season: s });
            }
            if (plan.filters?.pos) rows = rows.filter((p) => ctx.players[p.id]?.pos === plan.filters.pos);
            const dir = plan.sortDir === 'asc' ? 1 : -1;
            const out = rows
                .sort((a, b) => dir * (a.points - b.points))
                .slice(0, plan.limit || 15)
                .map((p) => {
                    const info = ctx.players[p.id] || {};
                    return {
                        label: `${info.fn || ''} ${info.ln || ''}`.trim() || `Player ${p.id}`,
                        value: fmt2(p.points),
                        sub: `${p.season} · ${info.pos || ''}`,
                    };
                });
            return {
                headline: `Player seasons — ${seasons.length === 1 ? seasons[0] : 'all seasons'}${plan.filters?.pos ? `, ${plan.filters.pos}` : ''}, by starter points`,
                rows: out,
                note: 'One row per player-season; points count only in weeks the player was started.',
                href: '/records', hrefLabel: 'See Records',
            };
        },
    },
    {
        id: 'most-traded-players',
        description: 'Players ranked by how many times they have been traded (the Trade Analysis Most Traded table). Filter by position; sort by tradeCount or by post-trade starter points produced.',
        needs: ['overview'],
        filters: { pos: 'pos' },
        sorts: ['tradeCount', 'points'],
        examples: [
            { dataset: 'most-traded-players' },
            { dataset: 'most-traded-players', filters: { pos: 'WR' }, limit: 10 },
        ],
        execute(ctx, plan) {
            let rows = aggregateMostTradedPlayers(ctx.overview?.tradeData?.trades || []);
            if (plan.filters?.pos) rows = rows.filter((r) => r.position === plan.filters.pos);
            const byPoints = plan.sortBy === 'points';
            const key = byPoints ? 'starterPts' : 'tradeCount';
            const dir = plan.sortDir === 'asc' ? 1 : -1;
            const out = rows
                .sort((a, b) => dir * ((a[key] || 0) - (b[key] || 0)) || b.tradeCount - a.tradeCount)
                .slice(0, plan.limit || 15)
                .map((r) => ({
                    label: r.name,
                    value: `${r.tradeCount} trades`,
                    sub: `${r.position} · ${fmtPts(r.starterPts)} starter pts after trades · ${r.managerCount} managers`,
                }));
            return {
                headline: `Most traded players${plan.filters?.pos ? ` — ${plan.filters.pos}` : ''}${byPoints ? ', by post-trade starter points' : ''}`,
                rows: out,
                href: '/trade_analysis/players', hrefLabel: 'See Most Traded Players',
            };
        },
    },
    {
        id: 'cap-efficiency-players',
        description: 'Players ranked by cap efficiency: a season\'s cap value divided by that season\'s starter points (the Cap Analysis $/pt — LOWER is more efficient). Scoped by season: no season filter means the current season; season "all" sums each player\'s points and cap dollars across every season first (never an average of yearly ratios). Filter by season, position, manager; sort by efficiency or points.',
        needs: ['capEff'],
        filters: { season: 'season', pos: 'pos', manager: 'manager' },
        sorts: ['efficiency', 'points'],
        examples: [
            { dataset: 'cap-efficiency-players' },
            { dataset: 'cap-efficiency-players', filters: { season: 'all' }, limit: 10 },
            { dataset: 'cap-efficiency-players', filters: { season: 2025, pos: 'RB' } },
        ],
        execute(ctx, plan) {
            const season = plan.filters?.season;
            let rows;
            let seasonLabel;
            if (season === 'all') {
                const byName = new Map();
                for (const r of ctx.capEff.playerRows || []) {
                    if (!byName.has(r.name)) byName.set(r.name, { name: r.name, position: r.position, capHit: 0, starterPts: 0, managers: new Set() });
                    const a = byName.get(r.name);
                    a.capHit += r.capHit || 0;
                    a.starterPts += r.starterPts || 0;
                    if (r.manager) a.managers.add(r.manager);
                }
                rows = [...byName.values()].map((a) => ({ ...a, manager: [...a.managers].join(', ') }));
                seasonLabel = 'all time';
            } else {
                const effYear = season && Number.isInteger(season) ? season : ctx.capEff.currentYear;
                rows = (ctx.capEff.playerRows || []).filter((r) => r.year === effYear);
                seasonLabel = String(effYear);
            }
            if (plan.filters?.pos) rows = rows.filter((r) => r.position === plan.filters.pos);
            if (plan.filters?.manager) rows = rows.filter((r) => (r.manager || '').split(', ').includes(plan.filters.manager));
            rows = rows
                .filter((r) => (r.starterPts || 0) > 0 && (r.capHit || 0) > 0)
                // Sort on the producer's own $/pt field (rounded to
                // cents, exactly the key the Cap Analysis page sorts
                // by); all-time rows have no such field, so compute
                // the same rounded key from the summed totals.
                .map((r) => ({ ...r, eff: r.dollarPerStarterPt != null ? r.dollarPerStarterPt : Math.round((r.capHit / r.starterPts) * 100) / 100 }));
            const byPoints = plan.sortBy === 'points';
            const dir = byPoints
                ? (plan.sortDir === 'asc' ? 1 : -1)
                : (plan.sortDir === 'desc' ? -1 : 1);
            const out = rows
                .sort((a, b) => (byPoints ? dir * (a.starterPts - b.starterPts) : dir * (a.eff - b.eff)))
                .slice(0, plan.limit || 15)
                .map((r) => ({
                    label: r.name,
                    value: `$${r.eff.toFixed(2)}/pt`,
                    sub: `${fmtPts(r.starterPts)} starter pts · $${r.capHit} cap${r.manager ? ` · ${r.manager}` : ''} · ${r.position}`,
                }));
            return {
                headline: `Cap efficiency — players, ${seasonLabel}${plan.filters?.pos ? `, ${plan.filters.pos}` : ''} (${byPoints ? 'by starter points' : 'lowest $ per starter point'})`,
                rows: out,
                note: 'Efficiency = that season\'s cap value ÷ that season\'s starter points (Cap Analysis $/pt). All-time sums points and cap dollars across seasons before dividing.',
                href: '/cap_analysis/efficiency', hrefLabel: 'See Cap Analysis: Efficiency',
            };
        },
    },
    {
        id: 'cap-efficiency-teams',
        description: 'Teams ranked by cap efficiency ($ per starter point, lower is better) for one season, or all time (career cap dollars ÷ career starter points). Filter by season or manager; sort by efficiency or points.',
        needs: ['capEff'],
        filters: { season: 'season', manager: 'manager' },
        sorts: ['efficiency', 'points'],
        examples: [
            { dataset: 'cap-efficiency-teams' },
            { dataset: 'cap-efficiency-teams', filters: { season: 'all' } },
        ],
        execute(ctx, plan) {
            const season = plan.filters?.season;
            let rows;
            let seasonLabel;
            if (season === 'all') {
                const byManager = new Map();
                for (const r of ctx.capEff.seasonTrends || []) {
                    if (!byManager.has(r.manager)) byManager.set(r.manager, { manager: r.manager, capHit: 0, starterPts: 0 });
                    const a = byManager.get(r.manager);
                    a.capHit += r.capHit || 0;
                    a.starterPts += r.starterPts || 0;
                }
                rows = [...byManager.values()];
                seasonLabel = 'all time';
            } else {
                const effYear = season && Number.isInteger(season) ? season : ctx.capEff.currentYear;
                rows = (ctx.capEff.seasonTrends || []).filter((r) => r.year === effYear);
                seasonLabel = String(effYear);
            }
            if (plan.filters?.manager) rows = rows.filter((r) => r.manager === plan.filters.manager);
            rows = rows
                .filter((r) => (r.starterPts || 0) > 0 && (r.capHit || 0) > 0)
                .map((r) => ({ ...r, eff: r.dollarPerStarterPt != null ? r.dollarPerStarterPt : Math.round((r.capHit / r.starterPts) * 100) / 100 }));
            const byPoints = plan.sortBy === 'points';
            const dir = byPoints
                ? (plan.sortDir === 'asc' ? 1 : -1)
                : (plan.sortDir === 'desc' ? -1 : 1);
            const out = rows
                .sort((a, b) => (byPoints ? dir * (a.starterPts - b.starterPts) : dir * (a.eff - b.eff)))
                .slice(0, plan.limit || 16)
                .map((r) => ({
                    label: r.manager,
                    value: `$${r.eff.toFixed(2)}/pt`,
                    sub: `${fmtPts(r.starterPts)} starter pts · $${r.capHit} cap`,
                }));
            return {
                headline: `Cap efficiency — teams, ${seasonLabel} (${byPoints ? 'by starter points' : 'lowest $ per starter point'})`,
                rows: out,
                note: 'Efficiency = cap dollars ÷ starter points for the scope (Cap Analysis $/pt). All-time sums across seasons before dividing.',
                href: '/cap_analysis/efficiency', hrefLabel: 'See Cap Analysis: Efficiency',
            };
        },
    },
    {
        id: 'drafter-by-position',
        description: 'Managers ranked by starter points their draft picks produced at ONE position (Draft Analysis per-position splits). Set the pos filter for "best TE drafter" style questions; without a position it ranks all picks combined.',
        needs: ['overview'],
        filters: { pos: 'pos', manager: 'manager' },
        sorts: ['points'],
        examples: [
            { dataset: 'drafter-by-position', filters: { pos: 'TE' } },
            { dataset: 'drafter-by-position', filters: { pos: 'RB' }, limit: 5 },
        ],
        execute(ctx, plan) {
            const pos = plan.filters?.pos;
            let rows = (ctx.overview?.draftData?.teamSummary || []).map((t) => {
                const pb = pos ? (t.posBreakdown?.[pos] || { starterPts: 0, count: 0 }) : null;
                return {
                    manager: t.manager,
                    pts: pos ? pb.starterPts : t.totalStarterPts,
                    count: pos ? pb.count : t.totalPicks,
                };
            });
            if (plan.filters?.manager) rows = rows.filter((r) => r.manager === plan.filters.manager);
            const dir = plan.sortDir === 'asc' ? 1 : -1;
            const out = rows
                .sort((a, b) => dir * (a.pts - b.pts))
                .slice(0, plan.limit || 16)
                .map((r) => ({
                    label: r.manager,
                    value: `${fmtPts(r.pts)} pts`,
                    sub: pos ? `${r.count} ${pos} picks` : `${r.count} picks`,
                }));
            return {
                headline: `Drafting — ${pos ? `${pos} picks` : 'all positions'}, by starter points produced`,
                rows: out,
                href: '/draft_analysis/position', hrefLabel: 'See Draft Analysis: By Position',
            };
        },
    },
    {
        id: 'trader-by-position',
        description: 'Managers ranked by starter points they ACQUIRED in trades at ONE position (Trade Analysis per-position splits — points received, post-trade only). Set the pos filter for "traded best for WRs" style questions; without a position it ranks total points acquired.',
        needs: ['overview'],
        filters: { pos: 'pos', manager: 'manager' },
        sorts: ['points'],
        examples: [
            { dataset: 'trader-by-position', filters: { pos: 'WR' } },
            { dataset: 'trader-by-position', filters: { pos: 'QB' }, limit: 5 },
        ],
        execute(ctx, plan) {
            const pos = plan.filters?.pos;
            let rows = (ctx.overview?.tradeData?.teamSummary || []).map((t) => {
                const pb = pos ? (t.posBreakdown?.[pos] || { starterPts: 0, count: 0 }) : null;
                return {
                    manager: t.manager,
                    pts: pos ? pb.starterPts : t.totalReceivedStarter,
                    count: pos ? pb.count : t.tradeCount,
                };
            });
            if (plan.filters?.manager) rows = rows.filter((r) => r.manager === plan.filters.manager);
            const dir = plan.sortDir === 'asc' ? 1 : -1;
            const out = rows
                .sort((a, b) => dir * (a.pts - b.pts))
                .slice(0, plan.limit || 16)
                .map((r) => ({
                    label: r.manager,
                    value: `${fmtPts(r.pts)} pts`,
                    sub: pos ? `${r.count} ${pos} acquisitions` : `${r.count} trades`,
                }));
            return {
                headline: `Trading — starter points acquired${pos ? ` at ${pos}` : ''} (post-trade only)`,
                rows: out,
                href: '/trade_analysis/position', hrefLabel: 'See Trade Analysis: By Position',
            };
        },
    },
    {
        id: 'trade-swings',
        description: 'Individual trade outcomes: every trade side ranked by net starter-point surplus (what that manager received minus what they gave up, post-trade points only). Sort ascending for the biggest trade losses. Filter by season (trade year) or manager.',
        needs: ['overview'],
        filters: { season: 'season', manager: 'manager' },
        sorts: ['surplus'],
        examples: [
            { dataset: 'trade-swings', limit: 10 },
            { dataset: 'trade-swings', sortBy: 'surplus', sortDir: 'asc', limit: 5 },
            { dataset: 'trade-swings', filters: { manager: 'Jake' } },
        ],
        execute(ctx, plan) {
            let rows = [];
            for (const trade of ctx.overview?.tradeData?.trades || []) {
                for (const side of trade.sides || []) {
                    const got = [
                        ...(side.playerDetails || []).map((p) => p.name),
                        ...(side.pickDetails || []).filter((p) => p.resolvedName).map((p) => p.resolvedName),
                    ];
                    rows.push({
                        manager: side.manager, year: trade.year, date: trade.date,
                        net: side.netStarterSurplus || 0, got,
                    });
                }
            }
            if (plan.filters?.season && plan.filters.season !== 'all') rows = rows.filter((r) => r.year === plan.filters.season);
            if (plan.filters?.manager) rows = rows.filter((r) => r.manager === plan.filters.manager);
            const dir = plan.sortDir === 'asc' ? 1 : -1;
            const out = rows
                .sort((a, b) => dir * (a.net - b.net))
                .slice(0, plan.limit || 10)
                .map((r) => ({
                    label: `${r.manager} — ${r.year}`,
                    value: `${fmt1(r.net)} pts`,
                    sub: `${r.date} · got ${r.got.length ? r.got.join(', ') : 'draft picks only'}`,
                }));
            return {
                headline: `${dir === 1 ? 'Biggest trade losses' : 'Biggest trade wins'} (net starter points, post-trade)`,
                rows: out,
                note: 'Each row is one manager\'s side of one trade: points received minus points given up, counting only points scored after the trade.',
                href: '/trade_analysis/log', hrefLabel: 'See Trade Analysis: Log',
            };
        },
    },
    {
        id: 'draft-picks',
        description: 'Individual draft picks ranked by the starter points the picked player produced (Draft Analysis log). Filter by draft year, position, or drafting manager.',
        needs: ['overview'],
        filters: { season: 'season', pos: 'pos', manager: 'manager' },
        sorts: ['points'],
        examples: [
            { dataset: 'draft-picks', limit: 10 },
            { dataset: 'draft-picks', filters: { season: 2024, pos: 'WR' } },
        ],
        execute(ctx, plan) {
            let rows = [];
            for (const draft of ctx.overview?.draftData?.drafts || []) {
                for (const pick of draft.picks || []) rows.push({ ...pick, year: draft.year });
            }
            if (plan.filters?.season && plan.filters.season !== 'all') rows = rows.filter((r) => r.year === plan.filters.season);
            if (plan.filters?.pos) rows = rows.filter((r) => r.position === plan.filters.pos);
            if (plan.filters?.manager) rows = rows.filter((r) => r.manager === plan.filters.manager);
            const dir = plan.sortDir === 'asc' ? 1 : -1;
            const out = rows
                .sort((a, b) => dir * ((a.starterPts || 0) - (b.starterPts || 0)))
                .slice(0, plan.limit || 15)
                .map((r) => ({
                    label: r.playerName,
                    value: `${fmtPts(r.starterPts)} pts`,
                    sub: `${r.year} · Round ${r.round} · ${r.manager} · ${r.position}`,
                }));
            return {
                headline: `Draft picks — ${plan.filters?.season && plan.filters.season !== 'all' ? plan.filters.season : 'all years'}${plan.filters?.pos ? `, ${plan.filters.pos}` : ''}, by starter points produced`,
                rows: out,
                href: '/draft_analysis/log', hrefLabel: 'See Draft Analysis: Log',
            };
        },
    },
];

export const datasetById = (id) => DATASETS.find((d) => d.id === id) || null;

export const executePlan = async (dataset, ctx, plan) => dataset.execute(ctx, plan || {});
