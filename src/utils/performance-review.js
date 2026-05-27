const fs = require('fs');
const path = require('path');
const { loadRecommendations } = require('./recommendation-log');
const { loadTradeExecutions } = require('./trade-log');
const { getKSTDate } = require('./article-archive');
const { loadPortfolio, enrichPortfolio, loadLatestPortfolioSnapshot } = require('./portfolio');
const { buildFreedomStatus, saveFreedomStatus } = require('./freedom-engine');
const { persistFinancialFreedomGoal } = require('./persistence');
const { buildPerformanceLab } = require('./performance-lab');
const { buildBehaviorReview } = require('./behavior-reviewer');
const { buildCollectorOpsSummary } = require('./collector-ops');
const { buildPriceSourceQualitySummary } = require('./price-source-quality');
const { buildLocalResearchSummary } = require('./local-research-worker');
const { buildPerformanceLearningFromReview } = require('./performance-learning');

const REVIEW_DIR = path.join(__dirname, '..', '..', 'data', 'performance-reviews');

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return getKSTDate(date);
}

function latestEvaluation(recommendation) {
  const entries = Object.entries(recommendation.evaluations || {})
    .map(([day, evaluation]) => ({ day: Number(day), evaluation }))
    .filter(item => item.evaluation && typeof item.evaluation.signalReturnPct === 'number')
    .sort((a, b) => b.day - a.day);
  return entries[0] || null;
}

function summarizeRecommendations(recommendations) {
  const evaluated = recommendations
    .map(recommendation => ({ recommendation, latest: latestEvaluation(recommendation) }))
    .filter(item => item.latest);
  const wins = evaluated.filter(item => item.latest.evaluation.signalReturnPct > 0);
  const avgSignalReturn = evaluated.length
    ? round(evaluated.reduce((sum, item) => sum + item.latest.evaluation.signalReturnPct, 0) / evaluated.length)
    : null;
  const avgAlpha = evaluated.filter(item => typeof item.latest.evaluation.alphaPct === 'number');

  const notes = buildNotes(recommendationSummary, tradeSummary, behaviorReview, collectorOps, priceSourceQuality, backtestResearch);
  const baseReview = {
    id: `${getKSTDate()}:${period}`,
    period,
    recommendationSummary,
    tradeSummary,
    performanceLab,
    behaviorReview,
    collectorOps,
    priceSourceQuality,
  };
  const performanceLearning = buildPerformanceLearningFromReview(baseReview);
  const improvementActions = buildImprovementActions({
    recommendationSummary,
    tradeSummary,
    behaviorReview,
    collectorOps,
    priceSourceQuality,
    performanceLearning,
    performanceLab,
    notes,
  });

  return {
    total: recommendations.length,
    evaluated: evaluated.length,
    winRatePct: evaluated.length ? round((wins.length / evaluated.length) * 100) : null,
    avgSignalReturnPct: avgSignalReturn,
    avgAlphaPct: avgAlpha.length
      ? round(avgAlpha.reduce((sum, item) => sum + item.latest.evaluation.alphaPct, 0) / avgAlpha.length)
      : null,
    bySignal: countBy(recommendations, item => item.signal || 'unknown'),
    byConviction: countBy(recommendations, item => item.conviction || 'unknown'),
    topFailures: recommendations
      .map(item => item.failureReason || item.failure_reason || '')
      .filter(Boolean)
      .reduce((acc, reason) => {
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {}),
  };
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function summarizeTrades(trades, recommendations) {
  const recommendationIds = new Set(recommendations.map(item => item.id));
  const linked = trades.filter(trade => trade.recommendationId && recommendationIds.has(trade.recommendationId));
  return {
    total: trades.length,
    buy: trades.filter(trade => trade.side === 'buy').length,
    sell: trades.filter(trade => trade.side === 'sell').length,
    linked: linked.length,
    unlinked: trades.length - linked.length,
    linkedRatePct: trades.length ? round((linked.length / trades.length) * 100) : null,
  };
}

function filterByWindow(items, dateKey, startDate) {
  return items.filter(item => (item[dateKey] || '').slice(0, 10) >= startDate);
}

async function buildPerformanceReview(period = 'weekly') {
  const days = period === 'monthly' ? 30 : 7;
  const startDate = daysAgo(days);
  const [recommendations, trades] = await Promise.all([
    loadRecommendations(),
    loadTradeExecutions(),
  ]);
  const periodRecommendations = filterByWindow(recommendations, 'date', startDate);
  const periodTrades = filterByWindow(trades, 'date', startDate);
  const recommendationSummary = summarizeRecommendations(periodRecommendations);
  const tradeSummary = summarizeTrades(periodTrades, periodRecommendations);
  const performanceLab = buildPerformanceLab({
    recommendations: periodRecommendations,
    trades: periodTrades,
  });
  const behaviorReview = buildBehaviorReview({
    recommendations: periodRecommendations,
    trades: periodTrades,
  });
  const [collectorOps, priceSourceQuality] = await Promise.all([
    buildCollectorOpsSummary({ days }),
    buildPriceSourceQualitySummary({ days }),
  ]);
  const backtestResearch = period === 'monthly'
    ? buildLocalResearchSummary({
        period,
        startDate,
        endDate: getKSTDate(),
        recommendations: periodRecommendations,
      })
    : null;
  let freedomPortfolio = null;
  if (period === 'monthly') {
    const enriched = await enrichPortfolio(loadPortfolio());
    const missingMarketValues = (enriched.positions || []).some(position => (
      typeof position.quantity === 'number' && typeof position.marketValue !== 'number'
    ));
    freedomPortfolio = missingMarketValues && loadLatestPortfolioSnapshot()?.totalAssetValue
      ? loadLatestPortfolioSnapshot()
      : enriched;
  }
  const freedomStatus = period === 'monthly'
    ? buildFreedomStatus({ portfolio: freedomPortfolio })
    : null;
  if (freedomStatus) saveFreedomStatus(freedomStatus);
  if (freedomStatus) await persistFinancialFreedomGoal(freedomStatus);

  return {
    id: `${getKSTDate()}:${period}`,
    period,
    startDate,
    endDate: getKSTDate(),
    generatedAt: new Date().toISOString(),
    recommendationSummary,
    tradeSummary,
    performanceLab,
    behaviorReview,
    collectorOps,
    priceSourceQuality,
    performanceLearning,
    backtestResearch,
    freedomStatus,
    notes,
    improvementActions,
  };
}

function buildImprovementActions({
  recommendationSummary = {},
  tradeSummary = {},
  behaviorReview = {},
  collectorOps = {},
  priceSourceQuality = {},
  performanceLab = {},
  performanceLearning = {},
} = {}) {
  const actions = [];
  const missed = performanceLab.missedRecommendationQuality || {};
  const executed = performanceLab.executedRecommendationQuality || {};
  const failures = performanceLab.failureAnalysis || [];
  const executionGap = performanceLab.executionGap || {};

  if (
    typeof missed.avgSignalReturnPct === 'number'
    && typeof executed.avgSignalReturnPct === 'number'
    && missed.avgSignalReturnPct - executed.avgSignalReturnPct >= 2
    && (executionGap.missedEvaluatedRecommendations || 0) >= 2
  ) {
    actions.push('실행하지 않은 추천의 성과가 실제 매수한 추천보다 높습니다. 다음 주에는 매수 후보를 임의로 건너뛰지 말고, 계좌 한도 때문에 못 산 경우 계획매매로 남깁니다.');
  }
  if (tradeSummary.linkedRatePct !== null && tradeSummary.linkedRatePct < 70) {
    actions.push('실제 매수는 추천 ID와 연결해 기록합니다. 추천 외 매수는 행동 리뷰에서 별도 검토 대상으로 남깁니다.');
  }
  const lowRiskRewardFailure = failures.find(item => item.reason === 'low_risk_reward' && item.count > 0);
  if (lowRiskRewardFailure) {
    actions.push('손익비 부족이 실패 원인으로 반복됩니다. 신규 추천은 최소 손익비와 손절가가 모두 계산된 후보만 매수 검토 후보로 유지합니다.');
  }
  if ((behaviorReview.recommendationHygiene?.missingStop || 0) > 0) {
    actions.push('손절 기준이 없는 bullish 추천은 저장하더라도 매수 후보가 아니라 관찰 후보로 낮춥니다.');
  }
  if (recommendationSummary.winRatePct !== null && recommendationSummary.winRatePct < 50) {
    actions.push('추천 승률이 낮습니다. 다음 추천에서는 기사 호재보다 가격 반응, 거래량, 20일선 위치를 우선 확인합니다.');
  }
  if (collectorOps.staleSuccess || (collectorOps.healthLabel === 'stale')) {
    actions.push('수집기 마지막 성공이 오래됐습니다. Cloud Run Scheduler와 GitHub 백업 수집 workflow를 먼저 확인합니다.');
  }
  if (priceSourceQuality.healthLabel === 'warn') {
    const decision = priceSourceQuality.providerDecision?.label || '가격 provider 경고';
    actions.push(`${decision}: 국내 fallback, 공식 EOD 비중, provider 실패율 중 어느 항목이 경고인지 분리해서 조치합니다.`);
  }
  for (const action of performanceLearning.actions || []) {
    actions.push(`다음 추천 룰 반영: ${action}`);
  }

  return [...new Set(actions)].slice(0, 6);
}

function buildNotes(recommendationSummary, tradeSummary, behaviorReview = {}, collectorOps = {}, priceSourceQuality = {}, backtestResearch = null) {
  const notes = [];
  if (recommendationSummary.evaluated === 0) {
    notes.push('평가 완료된 추천이 아직 부족합니다.');
  }
  if (tradeSummary.total === 0) {
    notes.push('실제 거래 기록이 없어 추천과 실행 간 차이를 분석할 수 없습니다.');
  } else if (tradeSummary.linkedRatePct !== null && tradeSummary.linkedRatePct < 70) {
    notes.push('실제 거래 중 추천과 연결되지 않은 비중이 높습니다.');
  }
  if (recommendationSummary.winRatePct !== null && recommendationSummary.winRatePct < 50) {
    notes.push('추천 승률이 50% 미만입니다. 추천 조건과 리스크 차단 기준을 재검토해야 합니다.');
  }
  for (const warning of behaviorReview.warnings || []) {
    notes.push(warning);
  }
  const actionableFailedRuns = collectorOps.actionableFailedRuns ?? collectorOps.failedRuns ?? 0;
  if (actionableFailedRuns > 0) {
    notes.push(`최근 조치가 필요한 수집 작업 실패 ${actionableFailedRuns}건이 있습니다. Cloud Run/Scheduler 로그를 확인해야 합니다.`);
  }
  const actionableFailedImmediate = collectorOps.alertEvents?.actionableFailedImmediate ?? collectorOps.alertEvents?.failedImmediate ?? 0;
  if (actionableFailedImmediate > 0) {
    notes.push(`최근 즉시 알림 전송 실패 ${actionableFailedImmediate}건이 있습니다.`);
  }
  if ((collectorOps.alertEvents?.pendingCatchUp || 0) > 0) {
    notes.push(`catch-up 중요 알림 ${collectorOps.alertEvents.pendingCatchUp}건이 다이제스트 대기 중입니다.`);
  }
  if (priceSourceQuality.healthLabel === 'empty') {
    notes.push('최근 가격 스냅샷이 없어 가격 provider 동작 여부를 확인해야 합니다.');
  }
  if (priceSourceQuality.healthLabel === 'warn') {
    notes.push('가격 source 품질이 주의 상태입니다. KRX/Data.go.kr/KIS와 fallback 사용 비율을 확인해야 합니다.');
  }
  if (backtestResearch?.enabled && backtestResearch.failures?.length > 0 && backtestResearch.results?.length === 0) {
    notes.push('로컬 Python 리서치 worker가 켜져 있지만 OHLCV 결과를 만들지 못했습니다. pykrx/FinanceDataReader 설치와 provider 상태를 확인해야 합니다.');
  }
  return notes;
}

function savePerformanceReview(review) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  const file = path.join(REVIEW_DIR, `${review.id}.json`.replace(/:/g, '-'));
  fs.writeFileSync(file, JSON.stringify(review, null, 2));
  return file;
}

module.exports = {
  REVIEW_DIR,
  buildPerformanceReview,
  savePerformanceReview,
  summarizeRecommendations,
  summarizeTrades,
  buildImprovementActions,
};
