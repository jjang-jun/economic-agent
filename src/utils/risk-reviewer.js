const STRATEGY_POLICY = require('../config/strategy-policy');

function addFactor(factors, name, passed, detail = '') {
  factors.push({ name, passed, detail });
}

function reviewStock(stock, decision = {}) {
  const profile = stock.risk_profile || {};
  const positionSize = profile.positionSize || profile.position_size || {};
  const market = stock.market_profile || {};
  const fundamental = stock.fundamental_profile || stock.fundamentalProfile || {};
  const statements = fundamental.statements || {};
  const earnings = fundamental.earnings || {};
  const marketRegime = decision.market?.regime || 'UNKNOWN';
  const marketTags = decision.market?.tags || [];
  const factors = [];
  const blockers = [];
  const warnings = [];

  addFactor(factors, 'market_regime', !['RISK_OFF', 'PANIC'].includes(marketRegime), marketRegime);
  const minRiskReward = positionSize.regimePolicy?.minRiskReward || STRATEGY_POLICY.recommendationRules.minRiskReward;
  addFactor(factors, 'risk_reward', typeof profile.riskReward === 'number' && profile.riskReward >= minRiskReward, profile.riskReward ? `${profile.riskReward}:1 / min ${minRiskReward}:1` : 'missing');
  addFactor(factors, 'stop_width', typeof profile.expectedLossPct === 'number' && profile.expectedLossPct <= STRATEGY_POLICY.recommendationRules.maxStopLossPct, profile.expectedLossPct ? `${profile.expectedLossPct}%` : 'missing');
  addFactor(factors, 'liquidity', market.liquid !== false, market.averageTurnover20d ? `${Math.round(market.averageTurnover20d).toLocaleString('ko-KR')} KRW` : 'missing');
  addFactor(factors, 'relative_strength', market.relativeStrength20d === null || market.relativeStrength20d === undefined || market.relativeStrength20d >= 0, typeof market.relativeStrength20d === 'number' ? `${market.relativeStrength20d}%p` : 'missing');
  addFactor(factors, 'momentum', market.near20dHigh !== false, typeof market.distanceFrom20dHighPct === 'number' ? `${market.distanceFrom20dHighPct}% from 20d high` : 'missing');
  addFactor(factors, 'position_size', Boolean(profile.suggestedAmount), profile.suggestedAmount ? `${profile.suggestedAmount.toLocaleString('ko-KR')} KRW` : 'missing');
  addFactor(factors, 'active_trading', fundamental.isActivelyTrading !== false, fundamental.isActivelyTrading === false ? 'inactive' : (fundamental.source || 'n/a'));

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
  if (typeof fundamental.marketCapUsd === 'number' && fundamental.marketCapUsd < 1_000_000_000) {
    warnings.push(`미국 소형주: 시가총액 ${Math.round(fundamental.marketCapUsd).toLocaleString('ko-KR')} USD`);
  }
  if (typeof fundamental.beta === 'number' && fundamental.beta > 2) {
    warnings.push(`고베타 종목: beta ${fundamental.beta}`);
  }
  if (fundamental.isAdr === true) {
    warnings.push('ADR 종목: 원시장/환율/예탁 리스크 확인 필요');
  }
  if (fundamental.isEtf === true) {
    warnings.push('ETF: 개별 기업 재무보다 보유자산/섹터 노출 기준으로 검토');
  }
  if (typeof statements.revenueGrowthYoYPct === 'number' && statements.revenueGrowthYoYPct < 0) {
    warnings.push(`매출 역성장: YoY ${statements.revenueGrowthYoYPct}%`);
  }
  if (typeof statements.netIncomeGrowthYoYPct === 'number' && statements.netIncomeGrowthYoYPct < 0) {
    warnings.push(`순이익 감소: YoY ${statements.netIncomeGrowthYoYPct}%`);
  }
  if (typeof statements.freeCashFlowMarginPct === 'number' && statements.freeCashFlowMarginPct < 0) {
    warnings.push(`FCF 마진 음수: ${statements.freeCashFlowMarginPct}%`);
  }
  if (typeof statements.debtToEquity === 'number' && statements.debtToEquity > 2) {
    warnings.push(`부채비율 주의: D/E ${statements.debtToEquity}`);
  }
  if (typeof earnings.daysUntilNext === 'number' && earnings.daysUntilNext >= 0 && earnings.daysUntilNext <= 7) {
    warnings.push(`실적발표 임박: ${earnings.nextDate} (${earnings.daysUntilNext}일 후)`);
  }
  if (typeof earnings.previousEpsSurprisePct === 'number' && earnings.previousEpsSurprisePct < -10) {
    warnings.push(`직전 EPS 쇼크: ${earnings.previousEpsSurprisePct}%`);
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
