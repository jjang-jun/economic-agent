const fs = require('fs');
const path = require('path');
const { loadRecommendationsWithStatus } = require('./recommendation-log');
const { loadResearchCandidatesWithStatus } = require('./research-candidate-log');
const { loadTradeExecutionsWithStatus } = require('./trade-log');
const { loadPortfolioCashFlowsWithStatus } = require('./portfolio-cash-flow');
const { getKSTDate } = require('./article-archive');
const { loadPortfolio, enrichPortfolio, loadLatestPortfolioSnapshot } = require('./portfolio');
const { loadStoredPortfolio } = require('./portfolio-store');
const { buildFreedomStatus, saveFreedomStatus } = require('./freedom-engine');
const { persistFinancialFreedomGoal, loadPersistedStockReports, selectRows } = require('./persistence');
const { buildPerformanceLab, isEligibleRecommendation } = require('./performance-lab');
const { buildBehaviorReview } = require('./behavior-reviewer');
const { buildCollectorOpsSummary } = require('./collector-ops');
const { buildPriceSourceQualitySummary } = require('./price-source-quality');
const { buildLocalResearchSummary } = require('./local-research-worker');
const { buildPerformanceLearningFromReview } = require('./performance-learning');
const { buildPortfolioReturnMetrics } = require('./portfolio-return');

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

function summarizeRecommendations(recommendations, options = {}) {
  const evaluated = recommendations
    .map(recommendation => ({ recommendation, latest: latestEvaluation(recommendation) }))
    .filter(item => item.latest);
  const wins = evaluated.filter(item => item.latest.evaluation.signalReturnPct > 0);
  const avgSignalReturn = evaluated.length
    ? round(evaluated.reduce((sum, item) => sum + item.latest.evaluation.signalReturnPct, 0) / evaluated.length)
    : null;
  const avgAlpha = evaluated.filter(item => typeof item.latest.evaluation.alphaPct === 'number');

  return {
    dataAvailable: options.dataAvailable !== false,
    persistenceAvailable: options.persistenceAvailable !== false,
    dataSource: options.dataSource || 'unknown',
    dataError: options.dataError || '',
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

function summarizeTrades(trades, recommendations, options = {}) {
  const recommendationIds = new Set(recommendations.map(item => item.id));
  const linked = trades.filter(trade => trade.recommendationId && recommendationIds.has(trade.recommendationId));
  return {
    dataAvailable: options.dataAvailable !== false,
    persistenceAvailable: options.persistenceAvailable !== false,
    dataSource: options.dataSource || 'unknown',
    dataError: options.dataError || '',
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

function summarizeRecommendationFunnel(reports = [], options = {}) {
  const stocks = reports.flatMap(report => report?.stocks || []);
  const approved = stocks.filter(stock => (
    stock.risk_review?.approved === true && stock.risk_review?.action === 'candidate'
  ));
  const blockerCounts = countBy(
    stocks.flatMap(stock => [...new Set((stock.risk_review?.blockers || [])
      .map(blocker => String(blocker).split(':')[0] || 'unknown'))]),
    blocker => blocker,
  );
  return {
    dataAvailable: options.dataAvailable !== false,
    dataError: options.dataError || '',
    reportDays: new Set(reports.map(report => report.date).filter(Boolean)).size,
    analyzedCandidates: stocks.length,
    bullishCandidates: stocks.filter(stock => stock.signal === 'bullish').length,
    watchOnlyCandidates: stocks.filter(stock => stock.risk_review?.action === 'watch_only').length,
    approvedCandidates: approved.length,
    schemaBlockedCandidates: stocks.filter(stock => stock.schema_validation?.passed === false).length,
    topBlockers: Object.entries(blockerCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
  };
}

function summarizeRecommendationTracker(recommendations = [], options = {}) {
  const verifiedCohort = recommendations.filter(isEligibleRecommendation);
  const evaluationEntries = recommendations.flatMap(recommendation => (
    Object.entries(recommendation.evaluations || {}).map(([day, evaluation]) => ({
      day: Number(day),
      evaluation,
    }))
  ));
  const latestRecommendationDate = recommendations
    .map(item => item.date || '')
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const latestVerifiedDate = verifiedCohort
    .map(item => item.date || '')
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const latestEvaluationAt = evaluationEntries
    .map(item => item.evaluation?.evaluatedAt || '')
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const byHorizon = Object.fromEntries([1, 5, 20].map(day => [
    day,
    recommendations.filter(item => item.evaluations?.[String(day)]).length,
  ]));
  const evaluatedRecommendations = recommendations.filter(item => (
    Object.keys(item.evaluations || {}).length > 0
  )).length;

  return {
    dataAvailable: options.dataAvailable !== false,
    dataError: options.dataError || '',
    totalStored: recommendations.length,
    evaluatedRecommendations,
    fullyEvaluatedRecommendations: byHorizon[20],
    verifiedCohort: verifiedCohort.length,
    verifiedCohort20d: verifiedCohort.filter(item => item.evaluations?.['20']).length,
    pendingRecommendations: recommendations.filter(item => item.status === 'open').length,
    missingPriceRecommendations: recommendations.filter(item => item.status === 'missing_price').length,
    latestRecommendationDate,
    latestVerifiedDate,
    latestEvaluationAt,
    byHorizon,
    engineHasHistory: recommendations.length > 0 && evaluatedRecommendations > 0,
  };
}

function summarizeResearchCandidates(candidates = [], options = {}) {
  const evaluated = candidates.filter(item => (
    typeof item.evaluations?.['20']?.signalReturnPct === 'number'
  ));
  const wins = evaluated.filter(item => item.evaluations['20'].signalReturnPct > 0);
  const alphaRows = evaluated.filter(item => typeof item.evaluations['20'].alphaPct === 'number');
  const blockerCounts = countBy(
    candidates.flatMap(item => [...new Set((item.rejectionReasons || [])
      .map(reason => String(reason).split(':')[0] || 'unknown'))]),
    reason => reason,
  );
  return {
    dataAvailable: options.dataAvailable !== false,
    dataError: options.dataError || '',
    total: candidates.length,
    evaluated20d: evaluated.length,
    pending: candidates.filter(item => item.status === 'open').length,
    missingPrice: candidates.filter(item => item.status === 'missing_price').length,
    winRatePct: evaluated.length ? round((wins.length / evaluated.length) * 100) : null,
    avgSignalReturnPct: evaluated.length
      ? round(evaluated.reduce((sum, item) => sum + item.evaluations['20'].signalReturnPct, 0) / evaluated.length)
      : null,
    avgAlphaPct: alphaRows.length
      ? round(alphaRows.reduce((sum, item) => sum + item.evaluations['20'].alphaPct, 0) / alphaRows.length)
      : null,
    topRejectionReasons: Object.entries(blockerCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
  };
}

function summarizePortfolioPerformance(portfolioResult = {}, snapshots = [], options = {}) {
  const portfolio = portfolioResult.portfolio || null;
  const validRows = snapshots
    .map(row => ({
      capturedAt: row.captured_at || row.payload?.capturedAt || '',
      totalAssetValue: Number(row.total_asset_value ?? row.payload?.totalAssetValue),
    }))
    .filter(row => Number.isFinite(row.totalAssetValue) && row.totalAssetValue > 0)
    .sort((a, b) => new Date(a.capturedAt || 0) - new Date(b.capturedAt || 0));
  const currentTotal = Number(portfolio?.totalAssetValue);
  if (portfolio?.capturedAt && Number.isFinite(currentTotal) && currentTotal > 0) {
    validRows.push({ capturedAt: portfolio.capturedAt, totalAssetValue: currentTotal });
    validRows.sort((a, b) => new Date(a.capturedAt || 0) - new Date(b.capturedAt || 0));
  }
  const start = validRows[0] || null;
  const rawChangeAmount = start && Number.isFinite(currentTotal) ? currentTotal - start.totalAssetValue : null;
  const positions = portfolio?.positions || [];
  const liveValuedPositions = positions.filter(position => position.priceSource === 'quote').length;
  const returnMetrics = buildPortfolioReturnMetrics({
    snapshots: validRows,
    cashFlows: options.cashFlows || [],
    benchmarkSnapshots: options.benchmarkSnapshots || [],
  });
  return {
    dataAvailable: portfolioResult.dataAvailable === true,
    source: portfolioResult.source || 'unavailable',
    currentTotalAssetValue: Number.isFinite(currentTotal) && currentTotal > 0 ? currentTotal : null,
    costBasis: typeof portfolio?.costBasis === 'number' ? portfolio.costBasis : null,
    unrealizedPnl: typeof portfolio?.unrealizedPnl === 'number' ? portfolio.unrealizedPnl : null,
    unrealizedPnlPct: typeof portfolio?.unrealizedPnlPct === 'number' ? portfolio.unrealizedPnlPct : null,
    unclassifiedAssetAmount: typeof portfolio?.unclassifiedAssetAmount === 'number'
      ? portfolio.unclassifiedAssetAmount
      : 0,
    positionCount: positions.length,
    liveValuedPositions,
    liveValuationCoveragePct: positions.length ? round((liveValuedPositions / positions.length) * 100) : null,
    snapshotCount: validRows.length,
    startTotalAssetValue: start?.totalAssetValue ?? null,
    startCapturedAt: start?.capturedAt || null,
    rawChangeAmount,
    rawChangePct: start && rawChangeAmount !== null
      ? round((rawChangeAmount / start.totalAssetValue) * 100)
      : null,
    cashFlowDataAvailable: options.cashFlowDataAvailable === true,
    cashFlowDataError: options.cashFlowDataError || '',
    netExternalFlow: returnMetrics.netExternalFlow,
    cashFlowAdjustedChangeAmount: rawChangeAmount !== null && options.cashFlowDataAvailable === true
      ? rawChangeAmount - returnMetrics.netExternalFlow
      : null,
    changeIncludesCashFlows: options.cashFlowDataAvailable !== true,
    returnMetrics,
    topPositions: positions
      .filter(position => typeof position.marketValue === 'number')
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 3)
      .map(position => ({
        name: position.name || position.ticker,
        marketValue: position.marketValue,
        weightPct: typeof position.weight === 'number' ? round(position.weight * 100) : null,
        unrealizedPnlPct: position.unrealizedPnlPct ?? null,
      })),
  };
}

async function resolveReviewPortfolio() {
  let source = 'supabase_store';
  let raw = null;
  try {
    raw = await loadStoredPortfolio();
  } catch (err) {
    console.warn(`[성과리뷰] Supabase 포트폴리오 조회 실패: ${err.message}`);
  }
  if (!raw) {
    source = 'env_or_local';
    raw = loadPortfolio();
  }
  let portfolio = await enrichPortfolio(raw);
  if (!(portfolio?.totalAssetValue > 0)) {
    const snapshot = loadLatestPortfolioSnapshot();
    if (snapshot?.totalAssetValue > 0) {
      source = 'local_snapshot_fallback';
      portfolio = snapshot;
    }
  }
  return {
    portfolio,
    source,
    dataAvailable: Boolean(portfolio?.totalAssetValue > 0),
  };
}

async function buildPerformanceReview(period = 'weekly', options = {}) {
  const days = period === 'monthly' ? 30 : 7;
  const startDate = daysAgo(days);
  const [recommendationResult, researchResult, tradeResult, cashFlowResult, stockReportResult] = await Promise.all([
    loadRecommendationsWithStatus(),
    loadResearchCandidatesWithStatus(),
    loadTradeExecutionsWithStatus(),
    loadPortfolioCashFlowsWithStatus(),
    loadPersistedStockReports({ startDate, limit: 100 }),
  ]);
  const recommendations = recommendationResult.recommendations;
  const researchCandidates = researchResult.candidates;
  const trades = tradeResult.trades;
  const periodRecommendations = filterByWindow(recommendations, 'date', startDate);
  const periodTrades = filterByWindow(trades, 'date', startDate);
  const periodCashFlows = filterByWindow(cashFlowResult.flows, 'date', startDate);
  const periodResearchCandidates = filterByWindow(researchCandidates, 'date', startDate);
  const recommendationSummary = summarizeRecommendations(periodRecommendations, {
    dataAvailable: recommendationResult.dataAvailable,
    persistenceAvailable: recommendationResult.persistenceAvailable,
    dataSource: recommendationResult.source,
    dataError: recommendationResult.error,
  });
  const tradeSummary = summarizeTrades(periodTrades, periodRecommendations, {
    dataAvailable: tradeResult.dataAvailable,
    persistenceAvailable: tradeResult.persistenceAvailable,
    dataSource: tradeResult.source,
    dataError: tradeResult.error,
  });
  const recommendationFunnel = summarizeRecommendationFunnel(stockReportResult.rows || [], {
    dataAvailable: !stockReportResult.error,
    dataError: stockReportResult.error?.message || '',
  });
  const recommendationTracker = summarizeRecommendationTracker(recommendations, {
    dataAvailable: recommendationResult.dataAvailable,
    dataError: recommendationResult.error,
  });
  const researchCandidateSummary = summarizeResearchCandidates(periodResearchCandidates, {
    dataAvailable: researchResult.dataAvailable,
    dataError: researchResult.error,
  });
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
  let portfolioResult = { portfolio: null, source: 'not_requested', dataAvailable: false };
  let portfolioSnapshots = [];
  let benchmarkSnapshots = [];
  if (period === 'monthly') {
    portfolioResult = await resolveReviewPortfolio();
    const [snapshotResult, benchmarkResult] = await Promise.all([
      selectRows('portfolio_snapshots', {
        select: 'captured_at,total_asset_value,payload',
        captured_at: `gte.${startDate}T00:00:00+09:00`,
        order: 'captured_at.asc',
        limit: '100',
      }),
      selectRows('price_snapshots', {
        select: 'as_of,price,symbol',
        symbol: 'eq.^KS11',
        as_of: `gte.${startDate}T00:00:00+09:00`,
        order: 'as_of.asc',
        limit: '500',
      }),
    ]);
    portfolioSnapshots = snapshotResult.rows || [];
    benchmarkSnapshots = benchmarkResult.rows || [];
  }
  const portfolioSummary = period === 'monthly'
    ? summarizePortfolioPerformance(portfolioResult, portfolioSnapshots, {
        cashFlows: periodCashFlows,
        cashFlowDataAvailable: cashFlowResult.persistenceAvailable === true,
        cashFlowDataError: cashFlowResult.error,
        benchmarkSnapshots,
      })
    : null;
  const freedomStatus = period === 'monthly' && portfolioResult.dataAvailable
    ? buildFreedomStatus({ portfolio: portfolioResult.portfolio })
    : null;
  if (freedomStatus && options.saveSideEffects !== false) saveFreedomStatus(freedomStatus);
  if (freedomStatus && options.persistSideEffects !== false) {
    await persistFinancialFreedomGoal(freedomStatus);
  }

  const baseReview = {
    id: `${getKSTDate()}:${period}`,
    period,
    startDate,
    endDate: getKSTDate(),
    generatedAt: new Date().toISOString(),
    recommendationSummary,
    recommendationFunnel,
    recommendationTracker,
    researchCandidateSummary,
    tradeSummary,
    portfolioSummary,
    performanceLab,
    behaviorReview,
    collectorOps,
    priceSourceQuality,
    backtestResearch,
    freedomStatus,
  };
  const performanceLearning = buildPerformanceLearningFromReview(baseReview);
  const notes = buildNotes(
    recommendationSummary,
    tradeSummary,
    behaviorReview,
    collectorOps,
    priceSourceQuality,
    backtestResearch,
    recommendationFunnel,
    portfolioSummary,
  );
  const improvementActions = buildImprovementActions({
    recommendationSummary,
    tradeSummary,
    behaviorReview,
    collectorOps,
    priceSourceQuality,
    performanceLearning,
    performanceLab,
    recommendationFunnel,
    portfolioSummary,
  });

  return {
    ...baseReview,
    performanceLearning,
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
  recommendationFunnel = {},
  portfolioSummary = {},
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
  if (priceSourceQuality.healthLabel === 'warn' && !String(priceSourceQuality.providerDecision?.action || '').startsWith('monitor')) {
    const decision = priceSourceQuality.providerDecision?.label || '가격 provider 경고';
    actions.push(`${decision}: 국내 fallback, 공식 EOD 비중, provider 실패율 중 어느 항목이 경고인지 분리해서 조치합니다.`);
  }
  for (const action of performanceLearning.actions || []) {
    actions.push(`다음 추천 룰 반영: ${action}`);
  }
  if ((recommendationSummary.total || 0) === 0 && (recommendationFunnel.analyzedCandidates || 0) > 0) {
    actions.push(`분석 후보 ${recommendationFunnel.analyzedCandidates}건이 모두 승인 추천에서 제외됐습니다. 상위 차단 사유와 시장 레짐을 다음 추천 전에 재검토합니다.`);
  }
  if (portfolioSummary.dataAvailable === false) {
    actions.unshift('포트폴리오 원본을 읽지 못했습니다. 경제적 자유 계산과 자산 성과 평가는 데이터 복구 전까지 중단합니다.');
  }

  return [...new Set(actions)].slice(0, 6);
}

function buildNotes(
  recommendationSummary,
  tradeSummary,
  behaviorReview = {},
  collectorOps = {},
  priceSourceQuality = {},
  backtestResearch = null,
  recommendationFunnel = {},
  portfolioSummary = {},
) {
  const notes = [];
  if (recommendationSummary.dataAvailable === false) {
    notes.push('추천 데이터 저장소를 읽지 못했습니다. 추천 0건은 실제 성과가 아니라 조회 실패 상태입니다.');
  } else if (recommendationSummary.evaluated === 0) {
    notes.push('평가 완료된 추천이 아직 부족합니다.');
  }
  if ((recommendationSummary.total || 0) === 0 && (recommendationFunnel.analyzedCandidates || 0) > 0) {
    notes.push(`추천 0건은 분석 중단이 아니라 리스크 승인 0건입니다. 분석 후보 ${recommendationFunnel.analyzedCandidates}건 중 관찰 후보 ${recommendationFunnel.watchOnlyCandidates || 0}건이었습니다.`);
  }
  if (tradeSummary.dataAvailable === false) {
    notes.push('실제 거래 저장소를 읽지 못했습니다. 거래 0건은 실제 미거래가 아니라 조회 실패 상태입니다.');
  } else if (tradeSummary.total === 0) {
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
  if (priceSourceQuality.healthLabel === 'warn' && !String(priceSourceQuality.providerDecision?.action || '').startsWith('monitor')) {
    notes.push('가격 source 품질이 주의 상태입니다. KRX/Data.go.kr/KIS와 fallback 사용 비율을 확인해야 합니다.');
  }
  if (portfolioSummary.dataAvailable === false) {
    notes.push('포트폴리오 데이터가 없어 자산·경제적 자유 수치를 계산하지 않았습니다.');
  } else if ((portfolioSummary.unclassifiedAssetAmount || 0) > 0) {
    notes.push(`미분류 자산 ${Math.round(portfolioSummary.unclassifiedAssetAmount).toLocaleString('ko-KR')}원은 종목 성과와 현금 여력 계산에서 제외했습니다.`);
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
  summarizeRecommendationFunnel,
  summarizeRecommendationTracker,
  summarizeResearchCandidates,
  summarizePortfolioPerformance,
  resolveReviewPortfolio,
  buildImprovementActions,
};
