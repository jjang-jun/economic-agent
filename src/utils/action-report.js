const fs = require('fs');
const path = require('path');
const { getKSTDate } = require('./article-archive');

const ACTION_REPORT_DIR = path.join(__dirname, '..', '..', 'data', 'action-reports');

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isRecent(recommendation, days = 3) {
  const created = toTime(recommendation.createdAt || recommendation.date);
  if (!created) return false;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}

function convictionRank(value) {
  return { high: 3, medium: 2, low: 1 }[value] || 0;
}

function sameHolding(position, recommendation) {
  return Boolean(
    (recommendation.symbol && position.symbol === recommendation.symbol)
    || (recommendation.ticker && position.ticker === recommendation.ticker)
  );
}

function positionValue(position, totalAssetValue = 0) {
  if (typeof position.marketValue === 'number' && Number.isFinite(position.marketValue)) return position.marketValue;
  if (typeof position.costBasis === 'number' && Number.isFinite(position.costBasis)) return position.costBasis;
  if (typeof position.weight === 'number' && Number.isFinite(position.weight) && totalAssetValue > 0) {
    return position.weight * totalAssetValue;
  }
  return 0;
}

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildPortfolioLimitContext(portfolio = {}) {
  const totalAssetValue = typeof portfolio.totalAssetValue === 'number' ? portfolio.totalAssetValue : 0;
  const maxSectorRatio = typeof portfolio.maxSectorRatio === 'number' ? portfolio.maxSectorRatio : null;
  const sectorWeights = {};

  for (const position of portfolio.positions || []) {
    if (!position.sector) continue;
    const value = positionValue(position, totalAssetValue);
    if (value <= 0 && typeof position.weight !== 'number') continue;
    if (typeof position.weight === 'number') {
      sectorWeights[position.sector] = (sectorWeights[position.sector] || 0) + position.weight;
    } else if (totalAssetValue > 0) {
      sectorWeights[position.sector] = (sectorWeights[position.sector] || 0) + value / totalAssetValue;
    }
  }

  const overweightSectors = new Map();
  if (maxSectorRatio !== null) {
    for (const [sector, weight] of Object.entries(sectorWeights)) {
      if (weight > maxSectorRatio) overweightSectors.set(sector, weight);
    }
  }

  return {
    totalAssetValue,
    maxSectorRatio,
    sectorWeights,
    overweightSectors,
  };
}

function recommendationSector(recommendation = {}) {
  const market = recommendation.marketProfile || recommendation.market_profile || {};
  const fundamental = recommendation.fundamentalProfile || recommendation.fundamental_profile || {};
  return recommendation.sector
    || recommendation.primary_sector
    || market.sector
    || fundamental.sector
    || '';
}

function isKoreanTicker(ticker = '') {
  return /^\d{6}(\.KS|\.KQ)?$/i.test(String(ticker).trim());
}

function recommendationEntryPrice(recommendation = {}) {
  const risk = recommendation.riskProfile || recommendation.risk_profile || {};
  const market = recommendation.marketProfile || recommendation.market_profile || {};
  const entry = recommendation.entry || {};
  return [risk.entryReferencePrice, entry.price, market.price]
    .find(value => typeof value === 'number' && Number.isFinite(value) && value > 0) || null;
}

function recommendationSuggestedAmount(recommendation = {}, portfolio = {}) {
  const risk = recommendation.riskProfile || recommendation.risk_profile || {};
  if (typeof risk.suggestedAmount !== 'number') return null;
  if (typeof portfolio.maxNewBuyAmount === 'number') {
    return Math.min(risk.suggestedAmount, portfolio.maxNewBuyAmount);
  }
  return risk.suggestedAmount;
}

function portfolioLimitBlockers(recommendation, portfolioContext) {
  const blockers = [];
  const sector = recommendationSector(recommendation);
  if (sector && portfolioContext.overweightSectors?.has(sector)) {
    const weight = portfolioContext.overweightSectors.get(sector);
    blockers.push(`sector_limit: ${sector} 섹터 ${Math.round(weight * 100)}% > 한도 ${Math.round(portfolioContext.maxSectorRatio * 100)}%`);
  }
  return blockers;
}

function actionReportBlockers(recommendation, portfolio, portfolioContext) {
  const blockers = [...portfolioLimitBlockers(recommendation, portfolioContext)];
  const entryPrice = recommendationEntryPrice(recommendation);
  const suggestedAmount = recommendationSuggestedAmount(recommendation, portfolio);
  if (
    isKoreanTicker(recommendation.ticker)
    && entryPrice
    && typeof suggestedAmount === 'number'
    && suggestedAmount < entryPrice
  ) {
    blockers.push(`lot_size: 1주 가격 ${Math.round(entryPrice).toLocaleString('ko-KR')}원 > 제안금액 ${Math.round(suggestedAmount).toLocaleString('ko-KR')}원`);
  }
  return blockers;
}

function withActionReportReview(recommendation, portfolio, portfolioContext) {
  const blockers = actionReportBlockers(recommendation, portfolio, portfolioContext);
  if (blockers.length === 0) return recommendation;
  const review = recommendation.riskReview || recommendation.risk_review || {};
  return {
    ...recommendation,
    riskReview: {
      ...review,
      approved: false,
      action: 'watch_only',
      blockers: [...(review.blockers || []), ...blockers],
    },
    actionReportBlockers: blockers,
  };
}

function buildStopPlan(position, portfolio, stopLossPct) {
  const currentPrice = typeof position.currentPrice === 'number' ? position.currentPrice : null;
  const avgPrice = typeof position.avgPrice === 'number' ? position.avgPrice : null;
  const pnlPct = typeof position.unrealizedPnlPct === 'number' ? position.unrealizedPnlPct : null;
  const stopWidth = Math.abs(stopLossPct);
  const baseStopPrice = avgPrice ? avgPrice * (1 - stopWidth / 100) : null;
  const trailingTriggerPct = typeof portfolio.trailingStopTriggerPct === 'number'
    ? portfolio.trailingStopTriggerPct
    : 10;
  const trailingStopPrice = currentPrice && pnlPct !== null && pnlPct >= trailingTriggerPct
    ? currentPrice * (1 - stopWidth / 100)
    : null;
  const stopPrice = [baseStopPrice, trailingStopPrice]
    .filter(value => typeof value === 'number' && Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), 0) || null;

  return {
    stopPrice: stopPrice ? round(stopPrice, 2) : null,
    baseStopPrice: baseStopPrice ? round(baseStopPrice, 2) : null,
    trailingStopPrice: trailingStopPrice ? round(trailingStopPrice, 2) : null,
    trailingApplied: Boolean(trailingStopPrice && stopPrice === trailingStopPrice),
    trailingTriggerPct,
  };
}

function buildTrimPlan(position, portfolio, portfolioContext, reasons = []) {
  const quantity = typeof position.quantity === 'number' ? position.quantity : null;
  const currentPrice = typeof position.currentPrice === 'number' ? position.currentPrice : null;
  const value = positionValue(position, portfolioContext.totalAssetValue);
  const weight = typeof position.weight === 'number' ? position.weight : null;
  const totalAssetValue = portfolioContext.totalAssetValue;
  const candidates = [];

  if (value > 0 && weight !== null && typeof portfolio.maxPositionRatio === 'number' && weight > portfolio.maxPositionRatio) {
    candidates.push({
      reason: 'position_limit',
      amount: Math.max(0, value - totalAssetValue * portfolio.maxPositionRatio),
    });
  }

  if (value > 0 && position.sector && portfolioContext.overweightSectors?.has(position.sector)) {
    const sectorWeight = portfolioContext.overweightSectors.get(position.sector);
    const sectorValue = totalAssetValue * sectorWeight;
    const sectorExcess = Math.max(0, sectorValue - totalAssetValue * portfolioContext.maxSectorRatio);
    const shareOfSector = sectorValue > 0 ? value / sectorValue : 0;
    candidates.push({
      reason: 'sector_rebalance',
      amount: sectorExcess * shareOfSector,
    });
  }

  if (value > 0 && reasons.some(reason => reason.includes('일부 이익 잠금'))) {
    candidates.push({
      reason: 'profit_lock',
      amount: value * 0.25,
    });
  }

  if (value > 0 && reasons.some(reason => reason.includes('단기 약세') || reason.includes('추세 약화'))) {
    candidates.push({
      reason: 'trend_weakness',
      amount: value * 0.25,
    });
  }

  const amount = candidates.length > 0
    ? Math.max(...candidates.map(candidate => candidate.amount || 0))
    : 0;
  const boundedAmount = Math.min(value, Math.max(0, amount));
  const quantityToSell = quantity && currentPrice && boundedAmount > 0
    ? (isKoreanTicker(position.ticker) ? Math.ceil(boundedAmount / currentPrice) : boundedAmount / currentPrice)
    : null;

  return {
    amount: boundedAmount ? Math.round(boundedAmount) : 0,
    quantity: quantityToSell ? Math.min(quantityToSell, quantity) : null,
    reasons: candidates.map(candidate => candidate.reason),
  };
}

function buildNewBuyCandidates(recommendations, portfolio) {
  const positions = portfolio.positions || [];
  const portfolioContext = buildPortfolioLimitContext(portfolio);
  return (recommendations || [])
    .filter(item => item.signal === 'bullish')
    .filter(item => isRecent(item))
    .filter(item => !(positions || []).some(position => sameHolding(position, item)))
    .filter(item => actionReportBlockers(item, portfolio, portfolioContext).length === 0)
    .filter(item => {
      const review = item.riskReview || item.risk_review || {};
      const risk = item.riskProfile || item.risk_profile || {};
      return review.action === 'candidate' || review.approved === true || risk.tradeable === true;
    })
    .sort((a, b) => {
      const ar = a.riskProfile || a.risk_profile || {};
      const br = b.riskProfile || b.risk_profile || {};
      return (
        convictionRank(b.conviction) - convictionRank(a.conviction)
        || (br.riskReward || 0) - (ar.riskReward || 0)
        || (br.suggestedAmount || 0) - (ar.suggestedAmount || 0)
      );
    })
    .slice(0, 5);
}

function buildWatchOnlyCandidates(recommendations, portfolio) {
  const positions = portfolio.positions || [];
  const portfolioContext = buildPortfolioLimitContext(portfolio);
  return (recommendations || [])
    .filter(item => item.signal === 'bullish')
    .filter(item => isRecent(item))
    .filter(item => !(positions || []).some(position => sameHolding(position, item)))
    .map(item => withActionReportReview(item, portfolio, portfolioContext))
    .filter(item => {
      const review = item.riskReview || item.risk_review || {};
      const risk = item.riskProfile || item.risk_profile || {};
      return review.action === 'watch_only' || review.approved === false || risk.tradeable === false || (item.actionReportBlockers || []).length > 0;
    })
    .slice(0, 5);
}

function classifyPosition(position, portfolio, portfolioContext = buildPortfolioLimitContext(portfolio)) {
  const stopLossPct = position.stopLossPct || portfolio.stopLossPct || 8;
  const trimProfitPct = portfolio.trimProfitPct || 20;
  const weight = typeof position.weight === 'number' ? position.weight : null;
  const pnlPct = typeof position.unrealizedPnlPct === 'number' ? position.unrealizedPnlPct : null;
  const return5dPct = typeof position.return5dPct === 'number' ? position.return5dPct : null;
  const return20dPct = typeof position.return20dPct === 'number' ? position.return20dPct : null;
  const reasons = [];
  const evidence = [];

  if (pnlPct !== null && pnlPct <= -Math.abs(stopLossPct)) {
    reasons.push(`손절 기준 ${stopLossPct}% 도달`);
    evidence.push(`현재 손익 ${pnlPct}% <= 손절 기준 -${Math.abs(stopLossPct)}%`);
    const stopPlan = buildStopPlan(position, portfolio, stopLossPct);
    return {
      action: 'sell',
      reasons,
      evidence,
      stopLossPct,
      stopPlan,
      trimPlan: buildTrimPlan(position, portfolio, portfolioContext, reasons),
    };
  }

  if (weight !== null && weight > portfolio.maxPositionRatio) {
    reasons.push(`종목 비중 ${Math.round(weight * 100)}%로 한도 초과`);
    evidence.push(`비중 ${Math.round(weight * 100)}% > 한도 ${Math.round(portfolio.maxPositionRatio * 100)}%`);
  }
  if (position.sector && portfolioContext.overweightSectors?.has(position.sector)) {
    const sectorWeight = portfolioContext.overweightSectors.get(position.sector);
    reasons.push(`${position.sector} 섹터 비중 ${Math.round(sectorWeight * 100)}%로 한도 초과`);
    evidence.push(`${position.sector} 섹터 ${Math.round(sectorWeight * 100)}% > 한도 ${Math.round(portfolioContext.maxSectorRatio * 100)}%`);
  }
  if (pnlPct !== null && pnlPct >= trimProfitPct) {
    reasons.push(`수익률 ${pnlPct}%로 일부 이익 잠금 후보`);
    evidence.push(`수익률 ${pnlPct}% >= 이익잠금 기준 ${trimProfitPct}%`);
  }
  if (return5dPct !== null && return5dPct <= -5) {
    reasons.push(`5일 수익률 ${return5dPct}%로 단기 약세`);
    evidence.push(`5일 수익률 ${return5dPct}%`);
  }
  if (return20dPct !== null && return20dPct <= -10) {
    reasons.push(`20일 수익률 ${return20dPct}%로 추세 약화`);
    evidence.push(`20일 수익률 ${return20dPct}%`);
  }

  const stopPlan = buildStopPlan(position, portfolio, stopLossPct);

  if (stopPlan.trailingApplied) {
    evidence.push(`수익 보호 손절가 ${round(stopPlan.stopPrice, 0)?.toLocaleString('ko-KR')}`);
  }

  if (reasons.length > 0) {
    return {
      action: 'reduce',
      reasons,
      evidence,
      stopLossPct,
      stopPlan,
      trimPlan: buildTrimPlan(position, portfolio, portfolioContext, reasons),
    };
  }

  if (pnlPct !== null) evidence.push(`현재 손익 ${pnlPct}%`);
  if (weight !== null) evidence.push(`비중 ${Math.round(weight * 100)}%`);
  if (return5dPct !== null) evidence.push(`5일 ${return5dPct}%`);
  if (return20dPct !== null) evidence.push(`20일 ${return20dPct}%`);
  evidence.push(`손절 기준 -${Math.abs(stopLossPct)}% 미도달`);
  return {
    action: 'hold',
    reasons: ['손절/비중/추세 경고 없음'],
    evidence,
    stopLossPct,
    stopPlan,
    trimPlan: buildTrimPlan(position, portfolio, portfolioContext, reasons),
  };
}

function buildPositionActions(portfolio) {
  const groups = { hold: [], reduce: [], sell: [] };
  const portfolioContext = buildPortfolioLimitContext(portfolio);
  for (const position of portfolio.positions || []) {
    const result = classifyPosition(position, portfolio, portfolioContext);
    groups[result.action].push({
      ...position,
      actionReasons: result.reasons,
      actionEvidence: result.evidence,
      actionStopLossPct: result.stopLossPct,
      actionStopPrice: result.stopPlan?.stopPrice ?? null,
      actionStopPlan: result.stopPlan,
      actionTrimPlan: result.trimPlan,
    });
  }
  return groups;
}

function buildActionReport({ recommendations, portfolio }) {
  const positionActions = buildPositionActions(portfolio);
  return {
    id: `${getKSTDate()}:action-report`,
    date: getKSTDate(),
    createdAt: new Date().toISOString(),
    portfolio: {
      totalAssetValue: portfolio.totalAssetValue,
      cashAmount: portfolio.cashAmount,
      cashRatio: portfolio.cashRatio,
      investedAmount: portfolio.investedAmount,
      unrealizedPnl: portfolio.unrealizedPnl,
      unrealizedPnlPct: portfolio.unrealizedPnlPct,
      positionCount: (portfolio.positions || []).length,
      maxNewBuyAmount: portfolio.maxNewBuyAmount,
      maxNewBuyRatio: portfolio.maxNewBuyRatio,
      maxPositionRatio: portfolio.maxPositionRatio,
    },
    newBuyCandidates: buildNewBuyCandidates(recommendations, portfolio),
    watchOnlyCandidates: buildWatchOnlyCandidates(recommendations, portfolio),
    holdCandidates: positionActions.hold,
    reduceCandidates: positionActions.reduce,
    sellCandidates: positionActions.sell,
  };
}

function saveActionReport(report) {
  fs.mkdirSync(ACTION_REPORT_DIR, { recursive: true });
  const file = path.join(ACTION_REPORT_DIR, `${report.date}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  return file;
}

module.exports = {
  ACTION_REPORT_DIR,
  buildActionReport,
  buildNewBuyCandidates,
  buildWatchOnlyCandidates,
  buildPositionActions,
  buildPortfolioLimitContext,
  classifyPosition,
  saveActionReport,
};
