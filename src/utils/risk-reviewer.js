const STRATEGY_POLICY = require('../config/strategy-policy');

function addFactor(factors, name, passed, detail = '') {
  factors.push({ name, passed, detail });
}

function reviewStock(stock, decision = {}) {
  const profile = stock.risk_profile || {};
  const positionSize = profile.positionSize || profile.position_size || {};
  const market = stock.market_profile || {};
  const marketRegime = decision.market?.regime || 'UNKNOWN';
  const marketTags = decision.market?.tags || [];
  const factors = [];
  const blockers = [];
  const warnings = [];

  addFactor(factors, 'market_regime', marketRegime !== 'RISK_OFF', marketRegime);
  const minRiskReward = positionSize.regimePolicy?.minRiskReward || STRATEGY_POLICY.recommendationRules.minRiskReward;
  addFactor(factors, 'risk_reward', typeof profile.riskReward === 'number' && profile.riskReward >= minRiskReward, profile.riskReward ? `${profile.riskReward}:1 / min ${minRiskReward}:1` : 'missing');
  addFactor(factors, 'stop_width', typeof profile.expectedLossPct === 'number' && profile.expectedLossPct <= STRATEGY_POLICY.recommendationRules.maxStopLossPct, profile.expectedLossPct ? `${profile.expectedLossPct}%` : 'missing');
  addFactor(factors, 'liquidity', market.liquid !== false, market.averageTurnover20d ? `${Math.round(market.averageTurnover20d).toLocaleString('ko-KR')} KRW` : 'missing');
  addFactor(factors, 'relative_strength', market.relativeStrength20d === null || market.relativeStrength20d === undefined || market.relativeStrength20d >= 0, typeof market.relativeStrength20d === 'number' ? `${market.relativeStrength20d}%p` : 'missing');
  addFactor(factors, 'momentum', market.near20dHigh !== false, typeof market.distanceFrom20dHighPct === 'number' ? `${market.distanceFrom20dHighPct}% from 20d high` : 'missing');
  addFactor(factors, 'position_size', Boolean(profile.suggestedAmount), profile.suggestedAmount ? `${profile.suggestedAmount.toLocaleString('ko-KR')} KRW` : 'missing');

  for (const factor of factors) {
    if (!factor.passed) blockers.push(`${factor.name}: ${factor.detail}`);
  }
  for (const blocker of positionSize.blockers || []) {
    blockers.push(blocker);
  }
  for (const warning of positionSize.warnings || []) {
    warnings.push(warning);
  }

  if (marketTags.includes('OVERHEATED')) {
    warnings.push('시장 과열: 급등 당일 전액 진입 금지');
  }
  if (marketTags.includes('CONCENTRATED_LEADERSHIP')) {
    warnings.push('대형주 쏠림: 주변 테마 추격 금지');
  }
  if (!profile.invalidation) {
    warnings.push('무효화 조건 누락');
  }

  const approved = blockers.length === 0 && profile.tradeable !== false;
  return {
    approved,
    action: approved ? 'candidate' : 'watch_only',
    factors,
    blockers,
    warnings,
  };
}

function applyRiskReview(report, decision) {
  if (!report?.stocks) return report;
  report.stocks = report.stocks.map(stock => ({
    ...stock,
    risk_review: reviewStock(stock, decision),
  }));
  return report;
}

module.exports = {
  reviewStock,
  applyRiskReview,
};
