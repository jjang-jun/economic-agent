const STRATEGY_POLICY = require('../config/strategy-policy');

function pct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function getRecommendationMap(recommendations = []) {
  return new Map(recommendations.filter(item => item.id).map(item => [item.id, item]));
}

function reviewTradesAgainstRecommendations({ trades = [], recommendations = [] } = {}) {
  const recommendationMap = getRecommendationMap(recommendations);
  const buyTrades = trades.filter(trade => trade.side === 'buy');
  const unlinkedBuys = buyTrades.filter(trade => !trade.recommendationId);
  const linkedBuys = buyTrades
    .map(trade => ({ trade, recommendation: recommendationMap.get(trade.recommendationId) }))
    .filter(item => item.recommendation);
  const watchOnlyBuys = linkedBuys.filter(({ recommendation }) => {
    const review = recommendation.riskReview || recommendation.risk_review || {};
    const risk = recommendation.riskProfile || recommendation.risk_profile || {};
    return review.action === 'watch_only' || review.approved === false || risk.tradeable === false;
  });
  const lowRiskRewardBuys = linkedBuys.filter(({ recommendation }) => {
    const risk = recommendation.riskProfile || recommendation.risk_profile || {};
    return typeof risk.riskReward === 'number'
      && risk.riskReward < STRATEGY_POLICY.recommendationRules.minRiskReward;
  });
  const missingStopBuys = linkedBuys.filter(({ recommendation }) => {
    const risk = recommendation.riskProfile || recommendation.risk_profile || {};
    return !risk.expectedLossPct && !risk.stopLossPrice;
  });

  return {
    buyTrades: buyTrades.length,
    unlinkedBuys: unlinkedBuys.length,
    linkedBuys: linkedBuys.length,
    watchOnlyBuys: watchOnlyBuys.length,
    lowRiskRewardBuys: lowRiskRewardBuys.length,
    missingStopBuys: missingStopBuys.length,
    unlinkedBuyRatePct: buyTrades.length ? pct((unlinkedBuys.length / buyTrades.length) * 100) : null,
    watchOnlyBuyTickers: watchOnlyBuys.map(item => item.trade.ticker || item.trade.symbol).filter(Boolean),
    lowRiskRewardTickers: lowRiskRewardBuys.map(item => item.trade.ticker || item.trade.symbol).filter(Boolean),
  };
}

function reviewRecommendationHygiene(recommendations = []) {
  const bullish = recommendations.filter(item => item.signal === 'bullish');
  const missingRiskReward = bullish.filter(item => {
    const risk = item.riskProfile || item.risk_profile || {};
    return typeof risk.riskReward !== 'number';
  });
  const belowMinRiskReward = bullish.filter(item => {
    const risk = item.riskProfile || item.risk_profile || {};
    return typeof risk.riskReward === 'number'
      && risk.riskReward < STRATEGY_POLICY.recommendationRules.minRiskReward;
  });
  const missingStop = bullish.filter(item => {
    const risk = item.riskProfile || item.risk_profile || {};
    return !risk.expectedLossPct && !risk.stopLossPrice;
  });
  const missingEvidence = bullish.filter(item => (
    !Array.isArray(item.relatedNews) || item.relatedNews.length === 0
  ));

  return {
    bullish: bullish.length,
    missingRiskReward: missingRiskReward.length,
    belowMinRiskReward: belowMinRiskReward.length,
    missingStop: missingStop.length,
    missingEvidence: missingEvidence.length,
  };
}

function buildBehaviorReview({ trades = [], recommendations = [] } = {}) {
  const tradeReview = reviewTradesAgainstRecommendations({ trades, recommendations });
  const recommendationHygiene = reviewRecommendationHygiene(recommendations);
  const warnings = [];

  if (tradeReview.unlinkedBuys > 0) {
    warnings.push(`추천과 연결되지 않은 매수 ${tradeReview.unlinkedBuys}건`);
  }
  if (tradeReview.watchOnlyBuys > 0) {
    warnings.push(`관찰/차단 후보를 실제 매수한 기록 ${tradeReview.watchOnlyBuys}건`);
  }
  if (tradeReview.lowRiskRewardBuys > 0) {
    warnings.push(`최소 손익비 미달 후보 매수 ${tradeReview.lowRiskRewardBuys}건`);
  }
  if (tradeReview.missingStopBuys > 0) {
    warnings.push(`손절 기준 없는 추천과 연결된 매수 ${tradeReview.missingStopBuys}건`);
  }
  if (recommendationHygiene.belowMinRiskReward > 0) {
    warnings.push(`호재 후보 중 최소 손익비 미달 ${recommendationHygiene.belowMinRiskReward}건`);
  }
  if (recommendationHygiene.missingStop > 0) {
    warnings.push(`호재 후보 중 손절/예상 손실폭 누락 ${recommendationHygiene.missingStop}건`);
  }

  return {
    generatedAt: new Date().toISOString(),
    tradeReview,
    recommendationHygiene,
    warnings,
  };
}

module.exports = {
  reviewTradesAgainstRecommendations,
  reviewRecommendationHygiene,
  buildBehaviorReview,
};
