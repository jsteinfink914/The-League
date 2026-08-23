export function createTransactionRequests(leagueIDs, startWeek, loadWeek) {
  const requests = [];

  for (const seasonID of leagueIDs) {
    for (let requestWeek = Math.max(startWeek, 1); requestWeek >= 1; requestWeek--) {
      requests.push({
        seasonID,
        week: requestWeek,
        load: () => loadWeek(seasonID, requestWeek)
      });
    }
  }

  return requests;
}