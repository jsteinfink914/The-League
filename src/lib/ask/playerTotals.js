// Pure aggregation for season player leaderboards: sum each player's
// starter points across a season's matchup weeks. Starter points are
// already scored under this league's rules by Sleeper, so the totals are
// league points, not generic PPR. Bench points never count — only
// `starters` / `starters_points` are read, mirroring how the site's
// other stats treat production.
// weeksEntries: an array of weeks, each an array of Sleeper matchup
// entries ({ starters: [playerId], starters_points: [number] }).
export const aggregatePlayerTotals = (weeksEntries) => {
    const totals = new Map();
    for (const entries of weeksEntries || []) {
        for (const entry of entries || []) {
            const starters = entry.starters || [];
            const pts = entry.starters_points || [];
            starters.forEach((pid, i) => {
                if (!pid || pid === '0') return;
                totals.set(pid, (totals.get(pid) || 0) + (pts[i] || 0));
            });
        }
    }
    return [...totals.entries()]
        .map(([id, points]) => ({ id, points: Math.round((points + Number.EPSILON) * 100) / 100 }))
        .sort((a, b) => b.points - a.points);
};
