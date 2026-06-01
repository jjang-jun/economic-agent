function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[%:,]/g, '').trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function lower(value) {
  return String(value || '').toLowerCase();
}

function isSemiconductorExposure(stock = {}, fundamental = {}) {
  const text = [
    stock.ticker,
    stock.symbol,
    stock.name,
    fundamental.sector,
    fundamental.industry,
  ].map(lower).join(' ');
  return /\b(mu|nvda|amd|tsm|avgo)\b/.test(text)
    || text.includes('semiconductor')
    || text.includes('memory')
    || text.includes('chip')
    || text.includes('반도체');
}

function valuationPolicyFor(stock = {}, fundamental = {}) {
  const text = `${lower(fundamental.sector)} ${lower(fundamental.industry)} ${lower(stock.name)}`;
  if (text.includes('financial') || text.includes('bank') || text.includes('capital markets') || text.includes('증권')) {
    return { peFair: 12, peExpensive: 18, psFair: 4, psExpensive: 8 };
  }
  if (isSemiconductorExposure(stock, fundamental) || text.includes('technology')) {
    return { peFair: 35, peExpensive: 55, psFair: 10, psExpensive: 18 };
  }
  return { peFair: 25, peExpensive: 40, psFair: 6, psExpensive: 12 };
}

function hasTheme(decision = {}, id) {
  const tags = decision.market?.tags || [];
  const themes = decision.market?.themes || [];
  return tags.includes(id) || themes.some(theme => theme?.id === id);
}

function buildValuationProfile(stock = {}, decision = {}) {
  const fundamental = stock.fundamental_profile || stock.fundamentalProfile || {};
  const statements = fundamental.statements || {};
  const policy = valuationPolicyFor(stock, fundamental);
  const peRatio = firstNumber(stock.peRatio, stock.pe_ratio, statements.peRatio, fundamental.peRatio);
  const priceToSalesRatio = firstNumber(stock.priceToSalesRatio, stock.psRatio, statements.priceToSalesRatio);
  const priceToBookRatio = firstNumber(stock.priceToBookRatio, statements.priceToBookRatio);
  const evToEbitda = firstNumber(stock.evToEbitda, statements.enterpriseValueMultiple);
  const priceToFreeCashFlowRatio = firstNumber(stock.priceToFreeCashFlowRatio, statements.priceToFreeCashFlowRatio);
  const fcfYieldPct = firstNumber(stock.freeCashFlowYieldPct, statements.freeCashFlowYieldPct);
  const revenueGrowth = firstNumber(statements.revenueGrowthYoYPct, stock.revenueGrowthYoYPct);
  const earningsGrowth = firstNumber(statements.netIncomeGrowthYoYPct, stock.earningsGrowthYoYPct);
  const fcfMargin = firstNumber(statements.freeCashFlowMarginPct, stock.freeCashFlowMarginPct);
  const hasMetric = [peRatio, priceToSalesRatio, evToEbitda, priceToFreeCashFlowRatio, fcfYieldPct].some(value => typeof value === 'number');

  if (!hasMetric) {
    return {
      status: 'insufficient_data',
      action: 'allow',
      label: '가치평가 데이터 부족',
      score: 0,
      metrics: { peRatio, priceToSalesRatio, priceToBookRatio, evToEbitda, priceToFreeCashFlowRatio, fcfYieldPct },
      reasons: ['PER/PSR/EV/FCF 지표가 부족해 가치평가로 차단하지 않습니다.'],
      warnings: ['가치평가 데이터 부족: 재무 지표 확인 전 과도한 비중 금지'],
      blockers: [],
    };
  }

  const reasons = [];
  const warnings = [];
  const blockers = [];
  let score = 0;

  if (typeof peRatio === 'number') {
    if (peRatio <= policy.peFair) {
      score += 1;
      reasons.push(`PER ${round(peRatio)}배: 섹터 기준 부담 낮음`);
    } else if (peRatio >= policy.peExpensive) {
      score -= 2;
      warnings.push(`PER ${round(peRatio)}배: 이익 대비 가격 부담`);
    } else {
      reasons.push(`PER ${round(peRatio)}배: 섹터 기준 중립`);
    }
  }
  if (typeof priceToSalesRatio === 'number') {
    if (priceToSalesRatio <= policy.psFair) {
      score += 1;
      reasons.push(`PSR ${round(priceToSalesRatio)}배: 매출 대비 부담 낮음`);
    } else if (priceToSalesRatio >= policy.psExpensive) {
      score -= 2;
      warnings.push(`PSR ${round(priceToSalesRatio)}배: 성장 프리미엄 높음`);
    }
  }
  if (typeof fcfYieldPct === 'number') {
    if (fcfYieldPct >= 3) {
      score += 1;
      reasons.push(`FCF 수익률 ${round(fcfYieldPct)}%`);
    } else if (fcfYieldPct < 1) {
      score -= 1;
      warnings.push(`FCF 수익률 ${round(fcfYieldPct)}%: 현금흐름 대비 비쌈`);
    }
  } else if (typeof priceToFreeCashFlowRatio === 'number' && priceToFreeCashFlowRatio > 60) {
    score -= 1;
    warnings.push(`P/FCF ${round(priceToFreeCashFlowRatio)}배: 현금흐름 대비 비쌈`);
  }

  const strongGrowth = (revenueGrowth ?? 0) >= 15 && (earningsGrowth === null || earningsGrowth >= 10) && (fcfMargin === null || fcfMargin >= 5);
  const weakFundamentals = [revenueGrowth, earningsGrowth, fcfMargin].some(value => typeof value === 'number' && value < 0);
  const aiSemiconductorPremium = isSemiconductorExposure(stock, fundamental) && hasTheme(decision, 'AI_SEMICONDUCTOR_CYCLE');
  const expensive = score <= -2;

  if (strongGrowth) {
    score += 1;
    reasons.push('성장/현금흐름이 가격 프리미엄을 일부 뒷받침');
  }
  if (aiSemiconductorPremium && expensive) {
    warnings.push('AI/반도체 사이클 프리미엄: 추격보다 눌림/분할 진입 우선');
  }
  if (expensive && weakFundamentals && !aiSemiconductorPremium) {
    blockers.push('valuation: 비싼 밸류에이션과 약한 성장/현금흐름이 동시에 확인됨');
  }

  const status = blockers.length > 0
    ? 'overvalued_block'
    : (expensive ? 'expensive' : (score >= 2 ? 'attractive' : 'fair'));
  const labels = {
    insufficient_data: '가치평가 데이터 부족',
    overvalued_block: '고평가 차단',
    expensive: '비싼 편',
    fair: '적정/중립',
    attractive: '상대적으로 매력',
  };

  return {
    status,
    action: blockers.length > 0 ? 'block' : (expensive ? 'warn' : 'allow'),
    label: labels[status],
    score,
    policy,
    metrics: { peRatio, priceToSalesRatio, priceToBookRatio, evToEbitda, priceToFreeCashFlowRatio, fcfYieldPct },
    growth: { revenueGrowthYoYPct: revenueGrowth, earningsGrowthYoYPct: earningsGrowth, freeCashFlowMarginPct: fcfMargin },
    aiSemiconductorPremium,
    reasons,
    warnings,
    blockers,
  };
}

function applyValuationProfiles(report, decision) {
  if (!report?.stocks) return report;
  report.stocks = report.stocks.map(stock => ({
    ...stock,
    valuation_profile: buildValuationProfile(stock, decision),
  }));
  return report;
}

module.exports = {
  buildValuationProfile,
  applyValuationProfiles,
  isSemiconductorExposure,
};
