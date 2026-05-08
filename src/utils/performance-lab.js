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

function topGroups(groupSummary = {}, limit = 5) {
  return Object.entries(groupSummary)
    .map(([key, summary]) => ({ key, ...summary }))
    .filter(item => item.evaluated > 0)
    .sort((a, b) => (
      (b.avgSignalReturnPct ?? -Infinity) - (a.avgSignalReturnPct ?? -Infinity)
      || (b.winRatePct ?? -Infinity) - (a.winRatePct ?? -Infinity)
      || b.evaluated - a.evaluated
    ))
    .slice(0, limit);
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

function getRiskProfile(recommendation = {}) {
  return recommendation.riskProfile || recommendation.risk_profile || {};
}

function getRiskReview(recommendation = {}) {
  return recommendation.riskReview || recommendation.risk_review || {};
}

function getMarketProfile(recommendation = {}) {
  return recommendation.marketProfile || recommendation.market_profile || {};
}

function getFundamentalProfile(recommendation = {}) {
  return recommendation.fundamentalProfile || recommendation.fundamental_profile || {};
}

function getAiMetadata(recommendation = {}) {
  return recommendation.aiMetadata || recommendation.ai_metadata || {};
}

function aiVersionKey(recommendation = {}) {
  const metadata = getAiMetadata(recommendation);
  const promptVersion = metadata.promptVersion || metadata.prompt_version || recommendation.promptVersion || recommendation.prompt_version || 'legacy_prompt';
  const provider = metadata.provider || recommendation.aiProvider || recommendation.ai_provider || 'unknown_provider';
  const model = metadata.model || recommendation.aiModel || recommendation.ai_model || 'unknown_model';
  return `${promptVersion} / ${provider}:${model}`;
}

function sectorKey(recommendation = {}) {
  const market = getMarketProfile(recommendation);
  const fundamental = getFundamentalProfile(recommendation);
  const risk = getRiskProfile(recommendation);
  return recommendation.sector
    || recommendation.primarySector
    || recommendation.primary_sector
    || market.sector
    || fundamental.sector
    || risk.sector
    || 'unknown';
}

function riskFactorKeys(recommendation = {}) {
  const risk = getRiskProfile(recommendation);
  const review = getRiskReview(recommendation);
  const keys = [];
  if (typeof risk.riskReward !== 'number') keys.push('missing_rr');
  else if (risk.riskReward < 2) keys.push('low_rr');
  else keys.push('rr_ok');
  if (!risk.expectedLossPct && !risk.stopLossPrice) keys.push('missing_stop');
  if (typeof risk.expectedLossPct === 'number' && risk.expectedLossPct > 10) keys.push('wide_stop');
  if (review.approved === false || review.action === 'watch_only') keys.push('blocked_or_watch');
  for (const blocker of review.blockers || []) keys.push(`blocker:${String(blocker).split(':')[0]}`);
  for (const warning of review.warnings || []) keys.push(`warning:${String(warning).split(':')[0]}`);
  if (keys.length === 0) keys.push('no_flag');
  return [...new Set(keys)];
}

function classifyFailure(recommendation = {}) {
  const latest = latestEvaluation(recommendation);
  if (!latest) return 'not_evaluated';
  const evaluation = latest.evaluation;
  if ((evaluation.signalReturnPct ?? 0) > 0) return 'not_failure';
  const risk = getRiskProfile(recommendation);
  const review = getRiskReview(recommendation);
  if (evaluation.stopTouched === true) return 'stop_touched';
  if (typeof risk.riskReward === 'number' && risk.riskReward < 2) return 'low_risk_reward';
  if (typeof evaluation.alphaPct === 'number' && evaluation.alphaPct < 0) return 'underperformed_benchmark';
  if (typeof evaluation.maxDrawdownPct === 'number' && evaluation.maxDrawdownPct < -7) return 'large_drawdown';
  if (review.approved === false || review.action === 'watch_only') return 'blocked_candidate';
  if (recommendation.conviction === 'low') return 'low_conviction';
  if (!Array.isArray(recommendation.relatedNews) || recommendation.relatedNews.length === 0) return 'missing_evidence';
  return 'direction_failed';
}

function summarizeFailures(recommendations = []) {
  const failures = recommendations
    .map(recommendation => ({ recommendation, latest: latestEvaluation(recommendation), reason: classifyFailure(recommendation) }))
    .filter(item => item.latest && item.reason !== 'not_failure');
  const byReason = groupBy(failures, item => item.reason);
  return Object.entries(byReason)
    .map(([reason, items]) => ({
      reason,
      count: items.length,
      avgSignalReturnPct: summarizeEvaluated(items.map(item => item.recommendation)).avgSignalReturnPct,
      examples: items
        .slice(0, 3)
        .map(item => item.recommendation.name || item.recommendation.ticker || item.recommendation.symbol)
        .filter(Boolean),
    }))
    .sort((a, b) => b.count - a.count || (a.avgSignalReturnPct ?? 0) - (b.avgSignalReturnPct ?? 0));
}

function summarizeMultiKeyGroups(recommendations, getKeys) {
  const pairs = [];
  for (const recommendation of recommendations) {
    for (const key of getKeys(recommendation)) {
      pairs.push({ key, recommendation });
    }
  }
  const groups = groupBy(pairs, item => item.key);
  return Object.fromEntries(
    Object.entries(groups).map(([key, items]) => [key, summarizeEvaluated(items.map(item => item.recommendation))])
  );
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
    bySector: summarizeGroups(recommendations, sectorKey),
    byAiVersion: summarizeGroups(recommendations, aiVersionKey),
    byRiskFactor: summarizeMultiKeyGroups(recommendations, riskFactorKeys),
    failureAnalysis: summarizeFailures(recommendations),
    leaders: {
      sectors: topGroups(summarizeGroups(recommendations, sectorKey), 5),
      aiVersions: topGroups(summarizeGroups(recommendations, aiVersionKey), 5),
      riskFactors: topGroups(summarizeMultiKeyGroups(recommendations, riskFactorKeys), 5),
    },
  };
}

module.exports = {
  latestEvaluation,
  summarizeEvaluated,
  buildPerformanceLab,
  riskRewardBucket,
  aiVersionKey,
  sectorKey,
  riskFactorKeys,
  classifyFailure,
  summarizeFailures,
};
