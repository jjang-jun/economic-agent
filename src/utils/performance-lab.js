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

function evaluationAtHorizon(recommendation, horizonDays) {
  const evaluation = recommendation.evaluations?.[String(horizonDays)];
  return evaluation && typeof evaluation.signalReturnPct === 'number'
    ? { day: Number(horizonDays), evaluation }
    : null;
}

const TARGET_HORIZON_DAYS = { '1d': 1, '1w': 5, '1m': 20 };

function targetHorizonDays(recommendation = {}) {
  const horizon = recommendation.targetHorizon || recommendation.target_horizon || '';
  return TARGET_HORIZON_DAYS[horizon] || 20;
}

function evaluationForHorizon(recommendation, horizonDays) {
  return evaluationAtHorizon(
    recommendation,
    horizonDays === 'target' ? targetHorizonDays(recommendation) : horizonDays,
  );
}

function summarizeEvaluated(items, horizonDays = null) {
  const evaluated = items
    .map(recommendation => ({
      recommendation,
      latest: horizonDays
        ? evaluationForHorizon(recommendation, horizonDays)
        : latestEvaluation(recommendation),
    }))
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

function summarizeGroups(recommendations, getKey, horizonDays = null) {
  const groups = groupBy(recommendations, getKey);
  return Object.fromEntries(
    Object.entries(groups).map(([key, items]) => [key, summarizeEvaluated(items, horizonDays)])
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

function addSampleConfidence(items = [], minEvaluated = 5) {
  return items.map(item => {
    const evaluated = item.evaluated || 0;
    const sampleConfidence = evaluated >= minEvaluated ? 'enough' : 'insufficient';
    return {
      ...item,
      minEvaluated,
      sampleConfidence,
      sampleNote: sampleConfidence === 'enough'
        ? '표본 기준 충족'
        : `표본 부족: 평가 ${evaluated}/${minEvaluated}건`,
    };
  });
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
  const settings = [];
  const reasoningEffort = metadata.reasoningEffort || metadata.reasoning_effort;
  const verbosity = metadata.verbosity;
  const thinkingMode = metadata.thinkingMode || metadata.thinking_mode;
  if (reasoningEffort) settings.push(`reasoning=${reasoningEffort}`);
  if (verbosity) settings.push(`verbosity=${verbosity}`);
  if (thinkingMode) settings.push(`thinking=${thinkingMode}`);
  return [
    `${promptVersion} / ${provider}:${model}`,
    ...settings,
  ].join(' / ');
}

function aiModelKey(recommendation = {}) {
  const metadata = getAiMetadata(recommendation);
  const provider = metadata.provider || recommendation.aiProvider || recommendation.ai_provider || 'unknown_provider';
  const model = metadata.model || recommendation.aiModel || recommendation.ai_model || 'unknown_model';
  return `${provider}:${model}`;
}

function promptVersionKey(recommendation = {}) {
  const metadata = getAiMetadata(recommendation);
  return metadata.promptVersion
    || metadata.prompt_version
    || recommendation.promptVersion
    || recommendation.prompt_version
    || 'legacy_prompt';
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

function classifyFailure(recommendation = {}, horizonDays = null) {
  const latest = horizonDays
    ? evaluationForHorizon(recommendation, horizonDays)
    : latestEvaluation(recommendation);
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

function summarizeFailures(recommendations = [], horizonDays = null) {
  const failures = recommendations
    .map(recommendation => ({
      recommendation,
      latest: horizonDays
        ? evaluationForHorizon(recommendation, horizonDays)
        : latestEvaluation(recommendation),
      reason: classifyFailure(recommendation, horizonDays),
    }))
    .filter(item => item.latest && item.reason !== 'not_failure');
  const byReason = groupBy(failures, item => item.reason);
  return Object.entries(byReason)
    .map(([reason, items]) => ({
      reason,
      count: items.length,
      avgSignalReturnPct: summarizeEvaluated(
        items.map(item => item.recommendation),
        horizonDays,
      ).avgSignalReturnPct,
      examples: items
        .slice(0, 3)
        .map(item => item.recommendation.name || item.recommendation.ticker || item.recommendation.symbol)
        .filter(Boolean),
    }))
    .sort((a, b) => b.count - a.count || (a.avgSignalReturnPct ?? 0) - (b.avgSignalReturnPct ?? 0));
}

function summarizeMultiKeyGroups(recommendations, getKeys, horizonDays = null) {
  const pairs = [];
  for (const recommendation of recommendations) {
    for (const key of getKeys(recommendation)) {
      pairs.push({ key, recommendation });
    }
  }
  const groups = groupBy(pairs, item => item.key);
  return Object.fromEntries(
    Object.entries(groups).map(([key, items]) => [
      key,
      summarizeEvaluated(items.map(item => item.recommendation), horizonDays),
    ])
  );
}

function isEligibleRecommendation(recommendation = {}) {
  const review = getRiskReview(recommendation);
  const risk = getRiskProfile(recommendation);
  return ['bullish', 'bearish'].includes(recommendation.signal)
    && review.approved === true
    && review.action === 'candidate'
    && typeof recommendation.entry?.price === 'number'
    && typeof risk.riskReward === 'number'
    && Boolean(risk.expectedLossPct || risk.stopLossPrice);
}

function buildStrategyReadiness({
  recommendations = [],
  trades = [],
  primaryHorizonDays = 20,
  minEvaluated = Number(process.env.STRATEGY_MIN_EVALUATED || 30),
  minLinkedTrades = Number(process.env.STRATEGY_MIN_LINKED_TRADES || 10),
} = {}) {
  const evaluated = recommendations.filter(item => evaluationForHorizon(item, primaryHorizonDays));
  const withMetadata = evaluated.filter(item => (
    aiModelKey(item) !== 'unknown_provider:unknown_model'
    && promptVersionKey(item) !== 'legacy_prompt'
  ));
  const recommendationIds = new Set(recommendations.map(item => item.id).filter(Boolean));
  const linkedTrades = trades.filter(trade => (
    trade.recommendationId && recommendationIds.has(trade.recommendationId)
  )).length;
  const metadataCoveragePct = evaluated.length
    ? round((withMetadata.length / evaluated.length) * 100)
    : null;
  const blockers = [];
  if (evaluated.length < minEvaluated) {
    blockers.push(`approved_evaluations:${evaluated.length}/${minEvaluated}`);
  }
  if ((metadataCoveragePct ?? 0) < 80) {
    blockers.push(`metadata_coverage:${metadataCoveragePct ?? 0}/80`);
  }

  return {
    primaryHorizonDays,
    eligibleRecommendations: recommendations.length,
    evaluatedRecommendations: evaluated.length,
    minEvaluated,
    metadataCoveragePct,
    linkedTrades,
    minLinkedTrades,
    readyForRuleLearning: blockers.length === 0,
    readyForGoalValidation: blockers.length === 0 && linkedTrades >= minLinkedTrades,
    ready: blockers.length === 0,
    blockers: [
      ...blockers,
      ...(linkedTrades < minLinkedTrades ? [`linked_trades:${linkedTrades}/${minLinkedTrades}`] : []),
    ],
  };
}

function buildPerformanceLab({
  recommendations = [],
  trades = [],
  primaryHorizonDays = 'target',
  groupMinEvaluated = 5,
  eligibilityPredicate = isEligibleRecommendation,
} = {}) {
  const eligibleRecommendations = recommendations.filter(eligibilityPredicate);
  const linkedRecommendationIds = new Set(
    trades.map(trade => trade.recommendationId).filter(Boolean)
  );
  const executedRecommendations = eligibleRecommendations.filter(item => linkedRecommendationIds.has(item.id));
  const missedRecommendations = eligibleRecommendations.filter(item => !linkedRecommendationIds.has(item.id));
  const evaluatedMissed = missedRecommendations.filter(item => evaluationForHorizon(item, primaryHorizonDays));
  const evaluatedExecuted = executedRecommendations.filter(item => evaluationForHorizon(item, primaryHorizonDays));

  const aiVersionLeaders = addSampleConfidence(
    topGroups(summarizeGroups(eligibleRecommendations, aiVersionKey, primaryHorizonDays), 5),
    groupMinEvaluated
  );
  const aiModelLeaders = addSampleConfidence(
    topGroups(summarizeGroups(eligibleRecommendations, aiModelKey, primaryHorizonDays), 5),
    groupMinEvaluated
  );
  const promptVersionLeaders = addSampleConfidence(
    topGroups(summarizeGroups(eligibleRecommendations, promptVersionKey, primaryHorizonDays), 5),
    groupMinEvaluated
  );
  const byHorizon = Object.fromEntries(
    [1, 5, 20].map(day => [String(day), summarizeEvaluated(eligibleRecommendations, day)])
  );

  return {
    generatedAt: new Date().toISOString(),
    primaryHorizonDays,
    eligibility: {
      totalRecommendations: recommendations.length,
      eligibleRecommendations: eligibleRecommendations.length,
      excludedRecommendations: recommendations.length - eligibleRecommendations.length,
    },
    strategyReadiness: buildStrategyReadiness({
      recommendations: eligibleRecommendations,
      trades,
      primaryHorizonDays,
    }),
    allRecommendationQuality: summarizeEvaluated(recommendations, primaryHorizonDays),
    recommendationQuality: summarizeEvaluated(eligibleRecommendations, primaryHorizonDays),
    executedRecommendationQuality: summarizeEvaluated(executedRecommendations, primaryHorizonDays),
    missedRecommendationQuality: summarizeEvaluated(missedRecommendations, primaryHorizonDays),
    byHorizon,
    executionGap: {
      recommendationsTotal: eligibleRecommendations.length,
      linkedTrades: trades.filter(trade => trade.recommendationId).length,
      executedRecommendations: executedRecommendations.length,
      missedEvaluatedRecommendations: evaluatedMissed.length,
      executedEvaluatedRecommendations: evaluatedExecuted.length,
    },
    byConviction: summarizeGroups(eligibleRecommendations, item => item.conviction || 'unknown', primaryHorizonDays),
    bySignal: summarizeGroups(eligibleRecommendations, item => item.signal || 'unknown', primaryHorizonDays),
    byRiskReward: summarizeGroups(eligibleRecommendations, riskRewardBucket, primaryHorizonDays),
    bySector: summarizeGroups(eligibleRecommendations, sectorKey, primaryHorizonDays),
    byAiVersion: summarizeGroups(eligibleRecommendations, aiVersionKey, primaryHorizonDays),
    byAiModel: summarizeGroups(eligibleRecommendations, aiModelKey, primaryHorizonDays),
    byPromptVersion: summarizeGroups(eligibleRecommendations, promptVersionKey, primaryHorizonDays),
    byRiskFactor: summarizeMultiKeyGroups(eligibleRecommendations, riskFactorKeys, primaryHorizonDays),
    failureAnalysis: summarizeFailures(eligibleRecommendations, primaryHorizonDays),
    leaders: {
      sectors: topGroups(summarizeGroups(eligibleRecommendations, sectorKey, primaryHorizonDays), 5),
      aiVersions: aiVersionLeaders,
      aiModels: aiModelLeaders,
      promptVersions: promptVersionLeaders,
      riskFactors: topGroups(
        summarizeMultiKeyGroups(eligibleRecommendations, riskFactorKeys, primaryHorizonDays),
        5,
      ),
    },
  };
}

module.exports = {
  latestEvaluation,
  summarizeEvaluated,
  addSampleConfidence,
  buildPerformanceLab,
  riskRewardBucket,
  aiVersionKey,
  aiModelKey,
  promptVersionKey,
  sectorKey,
  riskFactorKeys,
  classifyFailure,
  summarizeFailures,
  evaluationAtHorizon,
  evaluationForHorizon,
  targetHorizonDays,
  isEligibleRecommendation,
  buildStrategyReadiness,
};
