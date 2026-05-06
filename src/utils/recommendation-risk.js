const STRATEGY_POLICY = require('../config/strategy-policy');
const { calculatePositionSize } = require('./position-sizer');

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const num = Number(value.replace(/[%:,]/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function firstNumber(...values) {
  for (const value of values) {
    const num = toNumber(value);
    if (num !== null) return num;
  }
  return null;
}

function normalizeRecommendationRisk(stock, decision) {
  const portfolio = decision?.portfolio || {};
  const totalAssetValue = portfolio.totalAssetValue || portfolio.summary?.totalAssetValue || null;

  const expectedUpsidePct = firstNumber(
    stock.expected_upside_pct,
    stock.expectedUpsidePct,
    stock.upside_pct,
    stock.target_upside_pct
  );
  const expectedLossPct = Math.abs(firstNumber(
    stock.expected_loss_pct,
    stock.expectedLossPct,
    stock.stop_loss_pct,
    stock.stopLossPct,
    portfolio.stopLossPct
  ) || 0);
  const upsideProbabilityPct = firstNumber(
    stock.upside_probability_pct,
    stock.upsideProbabilityPct,
    stock.probability_pct,
    stock.probability
  );
  const riskReward = expectedUpsidePct && expectedLossPct
    ? round(expectedUpsidePct / expectedLossPct)
    : null;
  const positionSize = calculatePositionSize({
    portfolio,
    market: decision?.market || {},
    ticker: stock.ticker || '',
    symbol: stock.symbol || '',
    sector: stock.sector || stock.primary_sector || '',
    expectedLossPct,
    riskReward,
  });

  const maxWeightPct = typeof portfolio.maxPositionRatio === 'number'
    ? round(portfolio.maxPositionRatio * 100)
    : null;
  const marketProfile = stock.market_profile || stock.marketProfile || {};
  const relativeStrengthPass = typeof marketProfile.relativeStrength20d === 'number'
    ? marketProfile.relativeStrength20d >= 0
    : null;
  const liquidityPass = typeof marketProfile.liquid === 'boolean' ? marketProfile.liquid : null;
  const momentumPass = typeof marketProfile.near20dHigh === 'boolean' ? marketProfile.near20dHigh : null;
  const tradeable = Boolean(
    riskReward !== null
    && riskReward >= positionSize.regimePolicy.minRiskReward
    && expectedLossPct > 0
    && expectedLossPct <= STRATEGY_POLICY.recommendationRules.maxStopLossPct
    && positionSize.suggestedAmount
    && positionSize.blockers.length === 0
    && liquidityPass !== false
    && relativeStrengthPass !== false
    && momentumPass !== false
  );

  return {
    upsideProbabilityPct,
    expectedUpsidePct,
    expectedLossPct: expectedLossPct || null,
    riskReward,
    suggestedAmount: positionSize.suggestedAmount,
    suggestedWeightPct: positionSize.suggestedWeightPct,
    expectedRiskAmount: positionSize.expectedRiskAmount,
    maxWeightPct,
    invalidation: stock.invalidation || stock.invalidation_condition || stock.stop_condition || stock.risk || '',
    positionSize,
    relativeStrengthPass,
    liquidityPass,
    momentumPass,
    tradeable,
    sizingFormula: positionSize.formula,
  };
}

function applyRecommendationRisk(report, decision) {
  if (!report?.stocks) return report;
  report.stocks = report.stocks.map(stock => ({
    ...stock,
    risk_profile: normalizeRecommendationRisk(stock, decision),
  }));
  return report;
}

module.exports = {
  normalizeRecommendationRisk,
  applyRecommendationRisk,
};
