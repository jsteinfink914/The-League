// The week a trade's points start counting from, split out of
// tradeAnalysis.js so it can be unit tested.
//
// Points count from the week the trade COMPLETED. Sleeper buckets a
// transaction by the week it was CREATED (trade._week); if the trade
// completed after every transaction in that bucket was created — and the
// bucket had later activity than this trade's own creation — it really
// completed in the following week, so the cutoff moves up one.
//
// trade: { _week, _seasonID, created, status_updated }
// weekActivity: Map(seasonID -> Map(week -> latest `created` in that bucket))
export const effectiveTradeWeek = (trade, weekActivity) => {
    const bucketWeek = trade._week ?? null;
    if (bucketWeek == null) return 1;
    const maxCreated = weekActivity?.get(trade._seasonID)?.get(bucketWeek);
    if (maxCreated != null && trade.status_updated > maxCreated && maxCreated > trade.created) {
        return bucketWeek + 1;
    }
    return bucketWeek;
};
