const fs = require('fs');
const path = require('path');
const { loadRecommendations } = require('./recommendation-log');
const { loadTradeExecutions } = require('./trade-log');
const { getKSTDate } = require('./article-archive');

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

  return {
    id: `${getKSTDate()}:${period}`,
    period,
    startDate,
    endDate: getKSTDate(),
    generatedAt: new Date().toISOString(),
    recommendationSummary,
    tradeSummary,
    notes: buildNotes(recommendationSummary, tradeSummary),
  };
}

function buildNotes(recommendationSummary, tradeSummary) {
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
};
