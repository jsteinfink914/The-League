export function resolveMatchupLoadState({ matchupsInfo, bracketsInfo, managerInfo, playersInfo }) {
  const requiredResults = [
    ['Matchup data', matchupsInfo],
    ['League manager data', managerInfo],
    ['Player data', playersInfo]
  ];
  const failed = requiredResults.find(([, result]) => result?.error);

  if (failed) {
    return {
      errorMessage: failed[1].error || `${failed[0]} could not be loaded.`,
      brackets: null
    };
  }

  return {
    errorMessage: '',
    matchupWeeks: matchupsInfo?.matchupWeeks || [],
    year: matchupsInfo?.year,
    week: matchupsInfo?.week,
    regularSeasonLength: matchupsInfo?.regularSeasonLength,
    failedWeeks: matchupsInfo?.failedWeeks || [],
    players: playersInfo?.players,
    playersStale: Boolean(playersInfo?.stale),
    leagueTeamManagers: managerInfo,
    brackets: bracketsInfo?.error ? null : bracketsInfo,
    bracketError: bracketsInfo?.error || ''
  };
}