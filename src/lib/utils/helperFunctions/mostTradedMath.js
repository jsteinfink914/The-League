// Most Traded Players aggregation — pure shaping over the processed
// trades buildTradeAnalysisData returns. Extracted from the Trade
// Analysis page component so the page and Ask run identical code.
// One count per trade-side appearance of a player (each trade moves a
// player to exactly one receiving side); starterPts/rosterPts are
// that stint's post-trade points for the receiving manager.
export function aggregateMostTradedPlayers(trades) {
  const counts = new Map(); // playerID -> { name, position, tradeCount, starterPts, rosterPts, managers: Set }
  for (const trade of trades || []) {
    for (const side of trade.sides || []) {
      for (const pd of side.playerDetails || []) {
        if (!counts.has(pd.playerID)) {
          counts.set(pd.playerID, { playerID: pd.playerID, name: pd.name, position: pd.position, tradeCount: 0, starterPts: 0, rosterPts: 0, managers: new Set() });
        }
        const e = counts.get(pd.playerID);
        e.tradeCount++;
        e.starterPts = Math.round((e.starterPts + pd.starterPts) * 10) / 10;
        e.rosterPts = Math.round((e.rosterPts + pd.rosterPts) * 10) / 10;
        e.managers.add(side.manager);
      }
    }
  }
  return [...counts.values()]
    .map(e => ({ ...e, managerCount: e.managers.size, managers: [...e.managers].sort().join(', ') }));
}
