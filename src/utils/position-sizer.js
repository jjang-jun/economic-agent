const STRATEGY_POLICY = require('../config/strategy-policy');

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function sameTicker(position, ticker, symbol) {
  return Boolean(
    (symbol && position.symbol === symbol)
    || (ticker && position.ticker === ticker)
  );
}

function getPositionValue(position) {
  return positiveNumber(position.marketValue) || positiveNumber(position.costBasis) || 0;
}

function getCurrentTickerValue(positions, ticker, symbol) {
  return (positions || [])
    .filter(position => sameTicker(position, ticker, symbol))
    .reduce((sum, position) => sum + getPositionValue(position), 0);
}

function getCurrentSectorValue(positions, sector) {
  if (!sector) return 0;
  return (positions || [])
    .filter(position => position.sector && position.sector === sector)
    .reduce((sum, position) => sum + getPositionValue(position), 0);
}

function getRegimePolicy(market = {}, policy = STRATEGY_POLICY) {
  const regime = market.regime || 'NEUTRAL';
  const tags = market.tags || [];
  if (regime === 'RISK_ON' && tags.includes('OVERHEATED')) {
    return {
      name: 'FRAGILE_RISK_ON',
      ...policy.regimeRules.FRAGILE_RISK_ON,
    };
  }
  return {
    name: regime,
    ...(policy.regimeRules[regime] || policy.regimeRules.NEUTRAL),
  };
}

function calculatePositionSize({
  portfolio = {},
  market = {},
  ticker = '',
  symbol = '',
  sector = '',
  expectedLossPct,
  riskReward,
  policy = STRATEGY_POLICY,
} = {}) {
  const totalAssetValue = positiveNumber(portfolio.totalAssetValue || portfolio.summary?.totalAssetValue);
  const cashAmount = typeof portfolio.cashAmount === 'number' ? Math.max(0, portfolio.cashAmount) : null;
  const positions = portfolio.positions || [];
  const regimePolicy = getRegimePolicy(market, policy);
  const capitalRules = policy.capitalRules || {};
  const recommendationRules = policy.recommendationRules || {};
  const blockers = [];
  const warnings = [];

  if (!totalAssetValue) blockers.push('total_asset_value: missing');
  if (!expectedLossPct || expectedLossPct <= 0) blockers.push('stop_loss: missing');
  if (expectedLossPct && expectedLossPct > recommendationRules.maxStopLossPct) {
    blockers.push(`stop_loss: ${expectedLossPct}% > ${recommendationRules.maxStopLossPct}%`);
  }
  if (typeof riskReward === 'number' && riskReward < regimePolicy.minRiskReward) {
    blockers.push(`risk_reward: ${riskReward}:1 < ${regimePolicy.minRiskReward}:1`);
  }
  if (!regimePolicy.allowNewBuy) {
    blockers.push(`market_regime: ${regimePolicy.name} blocks new buys`);
  }

  const maxSingleTradeRiskPct = capitalRules.maxSingleTradeRiskPct || 0.01;
  const maxPositionPct = portfolio.maxPositionRatio || capitalRules.maxSinglePositionPct;
  const maxSectorPct = portfolio.maxSectorRatio || capitalRules.maxSectorPct;
  const maxNewBuyPct = Math.min(
    portfolio.maxNewBuyRatio || capitalRules.defaultMaxNewBuyPct,
    regimePolicy.maxNewBuyRatio ?? capitalRules.defaultMaxNewBuyPct
  );
  const maxRiskAmount = totalAssetValue ? Math.floor(totalAssetValue * maxSingleTradeRiskPct) : null;
  const amountByRisk = maxRiskAmount && expectedLossPct
    ? Math.floor(maxRiskAmount / (expectedLossPct / 100))
    : null;
  const amountByNewBuyCap = totalAssetValue ? Math.floor(totalAssetValue * maxNewBuyPct) : null;
  const currentTickerValue = getCurrentTickerValue(positions, ticker, symbol);
  const amountByTickerLimit = totalAssetValue && maxPositionPct
    ? Math.max(0, Math.floor(totalAssetValue * maxPositionPct - currentTickerValue))
    : null;
  const currentSectorValue = getCurrentSectorValue(positions, sector);
  const amountBySectorLimit = totalAssetValue && sector && maxSectorPct
    ? Math.max(0, Math.floor(totalAssetValue * maxSectorPct - currentSectorValue))
    : null;

  const limits = [
    ['risk', amountByRisk],
    ['new_buy_cap', amountByNewBuyCap],
    ['ticker_limit', amountByTickerLimit],
    ['sector_limit', amountBySectorLimit],
    ['cash', cashAmount],
  ].filter(([, value]) => typeof value === 'number' && Number.isFinite(value));

  const suggestedAmount = limits.length
    ? Math.max(0, Math.min(...limits.map(([, value]) => value)))
    : null;
  if (!suggestedAmount) blockers.push('position_size: no available amount');

  if (currentTickerValue > 0) warnings.push('existing_position: 추가매수는 피라미딩 조건 확인 필요');
  if (sector && amountBySectorLimit === 0) warnings.push(`sector_limit: ${sector} 섹터 한도 도달`);

  return {
    suggestedAmount,
    suggestedWeightPct: suggestedAmount && totalAssetValue ? round((suggestedAmount / totalAssetValue) * 100) : null,
    expectedRiskAmount: suggestedAmount && expectedLossPct ? Math.floor(suggestedAmount * (expectedLossPct / 100)) : null,
    maxRiskAmount,
    maxSingleTradeRiskPct,
    maxNewBuyPct,
    maxPositionPct,
    maxSectorPct,
    regimePolicy: {
      name: regimePolicy.name,
      maxEquityExposure: regimePolicy.maxEquityExposure,
      maxNewBuyRatio: regimePolicy.maxNewBuyRatio,
      minRiskReward: regimePolicy.minRiskReward,
      allowNewBuy: regimePolicy.allowNewBuy,
    },
    limits: Object.fromEntries(limits),
    blockers,
    warnings,
    formula: maxRiskAmount && expectedLossPct
      ? `risk ${maxRiskAmount.toLocaleString('ko-KR')} / stop ${expectedLossPct}%`
      : '',
  };
}

module.exports = {
  calculatePositionSize,
  getRegimePolicy,
  getCurrentTickerValue,
  getCurrentSectorValue,
};
