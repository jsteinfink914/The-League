export function getTransactionLoadError(results) {
  const labels = ['Transaction data', 'Player data', 'League manager data'];
  const failedIndex = results.findIndex((result) => result?.error);
  if (failedIndex === -1) return '';
  return results[failedIndex].error || `${labels[failedIndex]} could not be loaded.`;
}