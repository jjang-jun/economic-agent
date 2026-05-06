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
  const riskBudget = portfolio.riskBudget || {};
  const totalAssetValue = portfolio.totalAssetValue || portfolio.summary?.totalAssetValue || null;
  const maxNewBuyAmount = riskBudget.maxNewBuyAmount || portfolio.summary?.maxNewBuyAmount || null;
  const maxRiskAmount = riskBudget.maxRisk1Pct || (totalAssetValue ? totalAssetValue * 0.01 : null);

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

  const formulaPositionAmount = maxRiskAmount && expectedLossPct
    ? Math.floor(maxRiskAmount / (expectedLossPct / 100))
    : null;
  const suggestedAmount = [formulaPositionAmount, maxNewBuyAmount]
    .filter(value => typeof value === 'number' && value > 0)
    .reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
  const finalSuggestedAmount = Number.isFinite(suggestedAmount) ? suggestedAmount : null;
  const suggestedWeightPct = finalSuggestedAmount && totalAssetValue
    ? round((finalSuggestedAmount / totalAssetValue) * 100)
    : null;

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
    && riskReward >= 2
    && expectedLossPct > 0
    && expectedLossPct <= 10
    && finalSuggestedAmount
    && liquidityPass !== false
    && relativeStrengthPass !== false
    && momentumPass !== false
  );

  return {
    upsideProbabilityPct,
    expectedUpsidePct,
    expectedLossPct: expectedLossPct || null,
    riskReward,
    suggestedAmount: finalSuggestedAmount,
    suggestedWeightPct,
    maxWeightPct,
    invalidation: stock.invalidation || stock.invalidation_condition || stock.stop_condition || stock.risk || '',
    relativeStrengthPass,
    liquidityPass,
    momentumPass,
    tradeable,
    sizingFormula: maxRiskAmount && expectedLossPct
      ? `risk ${Math.round(maxRiskAmount).toLocaleString('ko-KR')} / stop ${expectedLossPct}%`
      : '',
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
