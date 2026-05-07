function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function latestEvaluation(recommendation) {
  const entries = Object.entries(recommendation.evaluations || {})
    .map(([day, evaluation]) => ({ day: Number(day), evaluation }))
    .filter(item => item.evaluation && typeof item.evaluation.signalReturnPct === 'number')
    .sort((a, b) => b.day - a.day);
  return entries[0] || null;
}

function summarizeEvaluated(items) {
  const evaluated = items
    .map(recommendation => ({ recommendation, latest: latestEvaluation(recommendation) }))
    .filter(item => item.latest);
  const wins = evaluated.filter(item => item.latest.evaluation.signalReturnPct > 0);
  const alphaRows = evaluated.filter(item => typeof item.latest.evaluation.alphaPct === 'number');
  const mfeRows = evaluated.filter(item => typeof item.latest.evaluation.maxFavorableExcursionPct === 'number');
  const maeRows = evaluated.filter(item => typeof item.latest.evaluation.maxAdverseExcursionPct === 'number');
  const stopRows = evaluated.filter(item => item.latest.evaluation.stopTouched !== null && item.latest.evaluation.stopTouched !== undefined);
  const targetRows = evaluated.filter(item => item.latest.evaluation.targetTouched !== null && item.latest.evaluation.targetTouched !== undefined);

  return {
    total: items.length,
    evaluated: evaluated.length,
    winRatePct: evaluated.length ? round((wins.length / evaluated.length) * 100) : null,
    avgSignalReturnPct: evaluated.length
      ? round(evaluated.reduce((sum, item) => sum + item.latest.evaluation.signalReturnPct, 0) / evaluated.length)
      : null,
    avgAlphaPct: alphaRows.length
      ? round(alphaRows.reduce((sum, item) => sum + item.latest.evaluation.alphaPct, 0) / alphaRows.length)
      : null,
    avgMfePct: mfeRows.length
      ? round(mfeRows.reduce((sum, item) => sum + item.latest.evaluation.maxFavorableExcursionPct, 0) / mfeRows.length)
      : null,
    avgMaePct: maeRows.length
      ? round(maeRows.reduce((sum, item) => sum + item.latest.evaluation.maxAdverseExcursionPct, 0) / maeRows.length)
      : null,
    stopTouchedRatePct: stopRows.length
      ? round((stopRows.filter(item => item.latest.evaluation.stopTouched).length / stopRows.length) * 100)
      : null,
    targetTouchedRatePct: targetRows.length
      ? round((targetRows.filter(item => item.latest.evaluation.targetTouched).length / targetRows.length) * 100)
      : null,
  };
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function summarizeGroups(recommendations, getKey) {
  const groups = groupBy(recommendations, getKey);
  return Object.fromEntries(
    Object.entries(groups).map(([key, items]) => [key, summarizeEvaluated(items)])
  );
}

function riskRewardBucket(recommendation) {
  const risk = recommendation.riskProfile || recommendation.risk_profile || {};
  const rr = risk.riskReward;
  if (typeof rr !== 'number') return 'missing';
  if (rr < 1.5) return '<1.5';
  if (rr < 2) return '1.5-2.0';
  if (rr < 3) return '2.0-3.0';
  return '>=3.0';
}

function buildPerformanceLab({ recommendations = [], trades = [] } = {}) {
  const linkedRecommendationIds = new Set(
    trades.map(trade => trade.recommendationId).filter(Boolean)
  );
  const executedRecommendations = recommendations.filter(item => linkedRecommendationIds.has(item.id));
  const missedRecommendations = recommendations.filter(item => !linkedRecommendationIds.has(item.id));
  const evaluatedMissed = missedRecommendations.filter(item => latestEvaluation(item));
  const evaluatedExecuted = executedRecommendations.filter(item => latestEvaluation(item));

  return {
    generatedAt: new Date().toISOString(),
    recommendationQuality: summarizeEvaluated(recommendations),
    executedRecommendationQuality: summarizeEvaluated(executedRecommendations),
    missedRecommendationQuality: summarizeEvaluated(missedRecommendations),
    executionGap: {
      recommendationsTotal: recommendations.length,
      linkedTrades: trades.filter(trade => trade.recommendationId).length,
      executedRecommendations: executedRecommendations.length,
      missedEvaluatedRecommendations: evaluatedMissed.length,
      executedEvaluatedRecommendations: evaluatedExecuted.length,
    },
    byConviction: summarizeGroups(recommendations, item => item.conviction || 'unknown'),
    bySignal: summarizeGroups(recommendations, item => item.signal || 'unknown'),
    byRiskReward: summarizeGroups(recommendations, riskRewardBucket),
  };
}

module.exports = {
  latestEvaluation,
  summarizeEvaluated,
  buildPerformanceLab,
  riskRewardBucket,
};
