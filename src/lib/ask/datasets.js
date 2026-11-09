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

const avgOf = (row, fields) => fields.reduce((sum, f) => sum + (row[f] ?? 99), 0) / fields.length;

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
];

export const datasetById = (id) => DATASETS.find((d) => d.id === id) || null;

export const executePlan = async (dataset, ctx, plan) => dataset.execute(ctx, plan || {});
