export function buildMatchupWeeks(requests, results) {
  const failedWeeks = [];
  const matchupWeeks = results.map((result, index) => {
    const week = requests[index].week;
    if (result.status !== 'fulfilled') {
      failedWeeks.push(week);
      return { matchups: null, week, unavailable: true };
    }

    const matchups = {};
    for (const match of result.value || []) {
      if (!matchups[match.matchup_id]) matchups[match.matchup_id] = [];
      matchups[match.matchup_id].push({
        roster_id: match.roster_id,
        starters: match.starters,
        points: match.starters_points
      });
    }

    return { matchups, week, unavailable: false };
  });

  return { matchupWeeks, failedWeeks };
}