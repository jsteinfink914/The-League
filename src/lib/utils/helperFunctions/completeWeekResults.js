export function requireCompleteWeekResults(results, label) {
  const failedWeeks = results
    .map((result, index) => result.status === 'fulfilled' ? null : index + 1)
    .filter(Boolean);

  if (failedWeeks.length) {
    throw new Error(`${label} is temporarily unavailable because week${failedWeeks.length === 1 ? '' : 's'} ${failedWeeks.join(', ')} could not be loaded. Refresh to retry.`);
  }

  return results.map((result) => {
    if (!Array.isArray(result.value)) {
      throw new Error(`${label} returned malformed week data. Refresh to retry.`);
    }
    return result.value;
  });
}