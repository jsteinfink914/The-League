// Manager Overview's combined leaderboard, split out of the page component
// so the joins can be unit tested. The three datasets (cap, trade, draft)
// are joined on the manager NAME string — if one source ever spells a
// manager differently, that manager silently splits into two rows with
// the missing side zeroed. scripts/check-manager-names.mjs guards the
// name sources; the tests here pin the join behavior.

function rankArray(arr, key, ascending = false) {
    const valid = arr.filter(a => a[key] != null);
    const sorted = [...valid].sort((a, b) => ascending ? a[key] - b[key] : b[key] - a[key]);
    const result = {};
    sorted.forEach((item, i) => { result[item.manager] = i + 1; });
    return result;
}

export function buildCombined(capData, tradeData, draftData) {
    if (!capData || !tradeData || !draftData) return [];

    // Aggregate cap efficiency across ALL historical seasons per manager
    const careerCapMap = new Map();
    for (const entry of capData.seasonTrends || []) {
        if (!entry.manager) continue;
        if (!careerCapMap.has(entry.manager)) careerCapMap.set(entry.manager, { capHit: 0, starterPts: 0, rosterPts: 0 });
        const a = careerCapMap.get(entry.manager);
        a.capHit += entry.capHit || 0;
        a.starterPts += entry.starterPts || 0;
        a.rosterPts += entry.rosterPts || 0;
    }
    const careerCapEfficiency = [...careerCapMap.entries()].map(([manager, a]) => ({
        manager,
        capHit: a.capHit,
        starterPts: Math.round(a.starterPts * 10) / 10,
        rosterPts: Math.round(a.rosterPts * 10) / 10,
        dollarPerStarterPt: a.starterPts > 0 ? Math.round((a.capHit / a.starterPts) * 100) / 100 : null,
    }));

    const allManagers = [...new Set([
        ...careerCapEfficiency.map(t => t.manager),
        ...tradeData.teamSummary.map(t => t.manager),
        ...draftData.teamSummary.map(t => t.manager)
    ])].sort();

    const capRanks = rankArray(careerCapEfficiency.filter(t => t.dollarPerStarterPt != null), 'dollarPerStarterPt', true);
    const tradeRanks = rankArray(tradeData.teamSummary, 'netStarterSurplus', false);
    const draftRanks = rankArray(draftData.teamSummary, 'totalStarterPts', false);

    return allManagers.map(mgr => {
        const cap = careerCapEfficiency.find(t => t.manager === mgr);
        const trade = tradeData.teamSummary.find(t => t.manager === mgr);
        const draft = draftData.teamSummary.find(t => t.manager === mgr);

        const capRank = capRanks[mgr] ?? null;
        const tradeRank = tradeRanks[mgr] ?? null;
        const draftRank = draftRanks[mgr] ?? null;

        const ranks = [capRank, tradeRank, draftRank].filter(r => r != null);
        const avgRank = ranks.length > 0 ? Math.round((ranks.reduce((s, r) => s + r, 0) / ranks.length) * 10) / 10 : null;

        return {
            manager: mgr, capRank, tradeRank, draftRank, avgRank,
            dollarPerStarterPt: cap?.dollarPerStarterPt ?? null,
            capStarterPts: cap?.starterPts ?? 0,
            netTradeSurplus: trade?.netStarterSurplus ?? 0,
            totalReceivedStarter: trade?.totalReceivedStarter ?? 0,
            tradeCount: trade?.tradeCount ?? 0,
            draftTotalPts: draft?.totalStarterPts ?? 0,
            draftAvgPtsPerPick: draft?.avgStarterPtsPerPick ?? 0,
            bestDraftPick: draft?.bestPick ?? null,
            pendingPickCount: trade?.pendingPickCount ?? 0,
        };
    });
}
