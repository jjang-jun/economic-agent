const { loadPortfolio, enrichPortfolio } = require('./portfolio');

function countBySentiment(articles) {
  return articles.reduce((acc, article) => {
    const sentiment = article.sentiment || 'neutral';
    acc[sentiment] = (acc[sentiment] || 0) + 1;
    return acc;
  }, { bullish: 0, bearish: 0, neutral: 0 });
}

function findSnapshot(snapshot, symbol) {
  return (snapshot || []).find(item => item.symbol === symbol);
}

function getChange(item) {
  return typeof item?.changePercent === 'number' ? item.changePercent : null;
}

function getTrendSignal(snapshot, symbols) {
  const items = symbols
    .map(symbol => findSnapshot(snapshot, symbol))
    .filter(Boolean);
  let weak = 0;
  let strong = 0;
  const details = [];

  for (const item of items) {
    const daily = item.changePercent;
    const week = item.return5dPct;
    const month = item.return20dPct;
    if (typeof month === 'number' && month <= -5) weak++;
    if (typeof week === 'number' && week <= -3) weak++;
    if (typeof daily === 'number' && daily <= -1.5) weak++;
    if (typeof month === 'number' && month >= 5) strong++;
    if (typeof week === 'number' && week >= 3) strong++;
    if (typeof daily === 'number' && daily >= 1.5) strong++;
    if (typeof month === 'number') {
      details.push(`${item.name} 20일 ${month}%`);
    }
  }

  return { weak, strong, details };
}

function formatEok(value) {
  if (typeof value !== 'number') return 'n/a';
  return `${Math.round(value).toLocaleString('ko-KR')}억원`;
}

function scoreInvestorFlow(flow) {
  if (!flow?.latest) return { score: 0, reasons: [] };

  const latest = flow.latest;
  const sums5d = flow.sums5d || {};
  const combined = (latest.foreign || 0) + (latest.institution || 0);
  const combined5d = (sums5d.foreign || 0) + (sums5d.institution || 0);
  let score = 0;
  const reasons = [];

  if (combined <= -10000) {
    score -= 2;
    reasons.push(`수급 악화: 외국인+기관 ${formatEok(combined)} 순매도`);
  } else if (combined <= -5000) {
    score -= 1;
    reasons.push(`수급 부담: 외국인+기관 ${formatEok(combined)} 순매도`);
  } else if (combined >= 15000) {
    score += 2;
    reasons.push(`수급 개선: 외국인+기관 ${formatEok(combined)} 순매수`);
  } else if (combined >= 5000) {
    score += 1;
    reasons.push(`수급 우호: 외국인+기관 ${formatEok(combined)} 순매수`);
  }

  if (combined5d <= -20000) {
    score -= 1;
    reasons.push(`5일 누적 수급 약세: 외국인+기관 ${formatEok(combined5d)}`);
  } else if (combined5d >= 20000) {
    score += 1;
    reasons.push(`5일 누적 수급 강세: 외국인+기관 ${formatEok(combined5d)}`);
  }

  if (latest.foreign > 0 && latest.institution < 0) {
    reasons.push(`수급 엇갈림: 외국인 ${formatEok(latest.foreign)} 순매수, 기관 ${formatEok(latest.institution)} 순매도`);
  } else if (latest.foreign < 0 && latest.institution > 0) {
    reasons.push(`수급 엇갈림: 외국인 ${formatEok(latest.foreign)} 순매도, 기관 ${formatEok(latest.institution)} 순매수`);
  }

  return { score, reasons };
}

function classifyMarketRegime({ score, tags = [], vixPrice = null }) {
  if (score <= -4 || (typeof vixPrice === 'number' && vixPrice >= 35)) return 'PANIC';
  if (score <= -2) return 'RISK_OFF';
  if (score >= 3 && tags.includes('BROAD_RALLY') && !tags.includes('OVERHEATED')) return 'STRONG_RISK_ON';
  if (score >= 2 && (tags.includes('OVERHEATED') || tags.includes('CONCENTRATED_LEADERSHIP'))) return 'FRAGILE_RISK_ON';
  if (score >= 2) return 'RISK_ON';
  return 'NEUTRAL';
}

function scoreMarketRegime({ articles, indicators }) {
  const sentiment = countBySentiment(articles);
  const snapshot = indicators.marketSnapshot || [];
  let score = 0;
  const reasons = [];
  const tags = [];
  const warnings = [];

  const bearishRatio = articles.length > 0 ? sentiment.bearish / articles.length : 0;
  const bullishRatio = articles.length > 0 ? sentiment.bullish / articles.length : 0;

  if (bearishRatio >= 0.45) {
    score -= 2;
    reasons.push('악재성 뉴스/공시 비중이 높음');
  } else if (bullishRatio >= 0.45) {
    score += 1;
    reasons.push('호재성 뉴스/공시 비중이 우세');
  }

  const vix = findSnapshot(snapshot, '^VIX');
  if (vix?.price >= 25) {
    score -= 2;
    reasons.push(`VIX ${vix.price}로 변동성 경계`);
  } else if (vix?.price && vix.price < 18) {
    score += 1;
    reasons.push(`VIX ${vix.price}로 변동성 안정`);
  }

  const dollar = findSnapshot(snapshot, 'DX-Y.NYB');
  if (dollar?.price >= 106) {
    score -= 1;
    reasons.push(`달러지수 ${dollar.price}로 위험자산 부담`);
  }

  const usdkrw = findSnapshot(snapshot, 'KRW=X');
  if (usdkrw?.changePercent >= 0.8) {
    score -= 1;
    reasons.push(`USD/KRW ${usdkrw.changePercent}% 상승으로 원화 약세 부담`);
  }

  const domesticTrend = getTrendSignal(snapshot, ['^KS11', '^KQ11']);
  if (domesticTrend.weak >= 2) {
    score -= 2;
    reasons.push(`국내 지수 약세: ${domesticTrend.details.join(', ')}`);
  } else if (domesticTrend.strong >= 2) {
    score += 1;
    reasons.push(`국내 지수 개선: ${domesticTrend.details.join(', ')}`);
  }

  const kospi = findSnapshot(snapshot, '^KS11');
  const kosdaq = findSnapshot(snapshot, '^KQ11');
  const samsung = findSnapshot(snapshot, '005930.KS');
  const hynix = findSnapshot(snapshot, '000660.KS');
  const kospiChange = getChange(kospi);
  const kosdaqChange = getChange(kosdaq);
  const samsungChange = getChange(samsung);
  const hynixChange = getChange(hynix);
  const leaderChanges = [samsungChange, hynixChange].filter(value => typeof value === 'number');
  const leaderAvg = leaderChanges.length > 0
    ? leaderChanges.reduce((acc, value) => acc + value, 0) / leaderChanges.length
    : null;

  if (typeof kospiChange === 'number' && kospiChange >= 3) {
    tags.push('OVERHEATED');
    warnings.push(`KOSPI 당일 ${kospiChange}% 급등: 신규 진입은 분할만 허용`);
  }
  if (typeof kospiChange === 'number' && typeof kosdaqChange === 'number' && kospiChange - kosdaqChange >= 2) {
    tags.push('CONCENTRATED_LEADERSHIP');
    warnings.push(`KOSPI가 KOSDAQ보다 ${Math.round((kospiChange - kosdaqChange) * 10) / 10}%p 강함: 대형주 쏠림 확인`);
  }
  if (typeof leaderAvg === 'number' && typeof kospiChange === 'number' && leaderAvg - kospiChange >= 3) {
    tags.push('SEMICONDUCTOR_LEADERSHIP');
    reasons.push(`반도체 주도주 상대강도 우위: 삼성전자/SK하이닉스 평균 ${Math.round(leaderAvg * 10) / 10}%`);
  }
  if (typeof kospiChange === 'number' && typeof kosdaqChange === 'number' && kospiChange >= 1.5 && kosdaqChange >= 1.5) {
    tags.push('BROAD_RALLY');
    reasons.push('KOSPI/KOSDAQ 동반 상승으로 상승 폭 확산 신호');
  }

  const globalTrend = getTrendSignal(snapshot, ['SPY', 'QQQ', 'SOXX']);
  if (globalTrend.weak >= 3) {
    score -= 2;
    reasons.push(`미국/반도체 추세 약세: ${globalTrend.details.join(', ')}`);
  } else if (globalTrend.strong >= 3) {
    score += 1;
    reasons.push(`미국/반도체 추세 개선: ${globalTrend.details.join(', ')}`);
  }

  if (indicators.fedRate && Number(indicators.fedRate) >= 4.5) {
    score -= 1;
    reasons.push(`미국 기준금리 ${indicators.fedRate}%로 고금리 부담`);
  }

  const investorFlow = scoreInvestorFlow(indicators.investorFlow);
  score += investorFlow.score;
  reasons.push(...investorFlow.reasons);

  const uniqueTags = [...new Set(tags)];
  if (score >= 2 && uniqueTags.includes('OVERHEATED')) {
    uniqueTags.push('MOMENTUM_ALLOWED');
  }

  const base = { score, reasons, sentiment, tags: uniqueTags, warnings };
  return {
    regime: classifyMarketRegime({ score, tags: uniqueTags, vixPrice: vix?.price }),
    ...base,
  };
}

function summarizePortfolio(portfolio) {
  const positionCount = portfolio.positions.length;
  const cashPct = Math.round((portfolio.cashRatio || 0) * 100);
  const ratioCap = portfolio.totalAssetValue
    ? Math.floor(portfolio.totalAssetValue * portfolio.maxNewBuyRatio)
    : null;
  const absoluteCap = typeof portfolio.maxNewBuyAmount === 'number' ? portfolio.maxNewBuyAmount : null;
  const maxNewBuyAmount = [ratioCap, absoluteCap]
    .filter(value => typeof value === 'number' && Number.isFinite(value))
    .reduce((min, value) => Math.min(min, value), Infinity);
  const overweight = portfolio.positions
    .filter(position => typeof position.weight === 'number' && position.weight > portfolio.maxPositionRatio)
    .map(position => `${position.name || position.ticker} 비중 ${Math.round(position.weight * 100)}%`);

  const sectorWeights = portfolio.positions.reduce((acc, position) => {
    if (!position.sector || typeof position.weight !== 'number') return acc;
    acc[position.sector] = (acc[position.sector] || 0) + position.weight;
    return acc;
  }, {});
  const overweightSectors = Object.entries(sectorWeights)
    .filter(([, weight]) => weight > portfolio.maxSectorRatio)
    .map(([sector, weight]) => `${sector} 섹터 ${Math.round(weight * 100)}%`);

  return {
    positionCount,
    cashPct,
    cashAmount: portfolio.cashAmount,
    totalAssetValue: portfolio.totalAssetValue,
    maxNewBuyAmount: Number.isFinite(maxNewBuyAmount) ? maxNewBuyAmount : null,
    overweight,
    overweightSectors,
  };
}

function formatKRW(value) {
  if (typeof value !== 'number') return '';
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function buildRiskBudget(summary, portfolio) {
  const maxRisk1Pct = portfolio.totalAssetValue ? Math.floor(portfolio.totalAssetValue * 0.01) : null;
  const maxRisk2Pct = portfolio.totalAssetValue ? Math.floor(portfolio.totalAssetValue * 0.02) : null;
  return {
    maxRisk1Pct,
    maxRisk2Pct,
    maxNewBuyAmount: summary.maxNewBuyAmount,
  };
}

function buildActions(market, portfolio) {
  const regime = market.regime;
  const tags = market.tags || [];
  const summary = summarizePortfolio(portfolio);
  const riskBudget = buildRiskBudget(summary, portfolio);
  const portfolioChecks = [
    `현재 현금 비중 약 ${summary.cashPct}%, 보유 종목 ${summary.positionCount}개 기준으로 판단`,
    summary.maxNewBuyAmount
      ? `1회 신규 매수 상한 ${formatKRW(summary.maxNewBuyAmount)}`
      : '',
    ...summary.overweight.map(item => `${item}: 신규 매수보다 비중 점검 우선`),
    ...summary.overweightSectors.map(item => `${item}: 섹터 쏠림 완화 후보 점검`),
  ].filter(Boolean);

  const aggressiveChecks = [
    tags.includes('OVERHEATED') ? '급등 당일 전액 진입 금지, 최소 3회 분할 진입' : '',
    tags.includes('SEMICONDUCTOR_LEADERSHIP') ? '반도체/AI 핵심주와 직접 수혜주만 공격 후보로 제한' : '',
    tags.includes('CONCENTRATED_LEADERSHIP') ? '주변 테마주 추격 금지, 지수보다 약한 종목은 제외' : '',
    riskBudget.maxRisk1Pct ? `거래 1회 손실 허용액 ${formatKRW(riskBudget.maxRisk1Pct)}~${formatKRW(riskBudget.maxRisk2Pct)} 이내` : '',
    '손절선 없는 신규 매수 금지',
  ].filter(Boolean);

  if (regime === 'PANIC') {
    return [
      '신규 매수 금지',
      '현금 확보와 손절 기준 점검 우선',
      '레버리지/미수/추격매수 금지',
      ...portfolioChecks,
    ];
  }
  if (regime === 'RISK_OFF') {
    return [
      '신규 매수 중단 또는 최소화',
      `보유 종목은 손절 기준(${portfolio.stopLossPct}%)과 악재 공시 여부 우선 점검`,
      '현금 비중 유지, 고변동 성장주는 비중 축소 후보로 분류',
      ...portfolioChecks,
    ];
  }
  if (regime === 'STRONG_RISK_ON') {
    return [
      `high 확신도 추천만 총 자산의 ${Math.round(portfolio.maxNewBuyRatio * 100)}% 이내 분할 매수 후보`,
      '상승 폭이 넓은 장이므로 주도주 눌림목과 피라미딩 후보를 검토',
      '단, 손절선과 종목/섹터 한도는 유지',
      ...aggressiveChecks,
      ...portfolioChecks,
    ];
  }
  if (regime === 'FRAGILE_RISK_ON') {
    return [
      '제한적 신규 매수만 허용: 손익비 기준을 높이고 거래량 확인 필수',
      '대형주 쏠림/과열 구간이므로 주변 테마 추격 금지',
      '기존 보유 주도주 중심으로만 분할 접근',
      ...aggressiveChecks,
      ...portfolioChecks,
    ];
  }
  if (regime === 'RISK_ON') {
    return [
      `high 확신도 추천만 총 자산의 ${Math.round(portfolio.maxNewBuyRatio * 100)}% 이내 분할 매수 후보`,
      '섹터 쏠림과 종목별 최대 비중을 넘기지 않음',
      '호재 공시가 있는 종목은 다음날 거래량 확인 후 진입',
      ...aggressiveChecks,
      ...portfolioChecks,
    ];
  }
  return [
    `신규 매수는 총 자산의 ${Math.round(portfolio.maxNewBuyRatio * 100)}% 이하로 제한`,
    '추천 종목은 관찰 목록에 두고 가격/거래량 확인 후 분할 접근',
    '시장 방향성이 확인될 때까지 현금 비중을 유지',
    ...portfolioChecks,
  ];
}

function buildDecisionContext({ articles, indicators }) {
  const market = scoreMarketRegime({ articles, indicators });
  const portfolio = loadPortfolio();
  const portfolioSummary = summarizePortfolio(portfolio);
  return {
    market,
    portfolio: {
      cashRatio: portfolio.cashRatio,
      cashAmount: portfolio.cashAmount,
      totalAssetValue: portfolio.totalAssetValue,
      maxNewBuyRatio: portfolio.maxNewBuyRatio,
      maxPositionRatio: portfolio.maxPositionRatio,
      maxSectorRatio: portfolio.maxSectorRatio,
      stopLossPct: portfolio.stopLossPct,
      trimProfitPct: portfolio.trimProfitPct,
      positions: portfolio.positions,
      summary: portfolioSummary,
      riskBudget: buildRiskBudget(portfolioSummary, portfolio),
    },
    actions: buildActions(market, portfolio),
  };
}

async function buildDecisionContextWithQuotes({ articles, indicators }) {
  const market = scoreMarketRegime({ articles, indicators });
  const portfolio = await enrichPortfolio(loadPortfolio());
  const portfolioSummary = summarizePortfolio(portfolio);
  return {
    market,
    portfolio: {
      cashRatio: portfolio.cashRatio,
      cashAmount: portfolio.cashAmount,
      investedAmount: portfolio.investedAmount,
      totalAssetValue: portfolio.totalAssetValue,
      costBasis: portfolio.costBasis,
      unrealizedPnl: portfolio.unrealizedPnl,
      unrealizedPnlPct: portfolio.unrealizedPnlPct,
      capturedAt: portfolio.capturedAt,
      maxNewBuyRatio: portfolio.maxNewBuyRatio,
      maxPositionRatio: portfolio.maxPositionRatio,
      maxSectorRatio: portfolio.maxSectorRatio,
      stopLossPct: portfolio.stopLossPct,
      trimProfitPct: portfolio.trimProfitPct,
      positions: portfolio.positions,
      summary: portfolioSummary,
      riskBudget: buildRiskBudget(portfolioSummary, portfolio),
    },
    actions: buildActions(market, portfolio),
  };
}

module.exports = {
  buildDecisionContext,
  buildDecisionContextWithQuotes,
  scoreMarketRegime,
  classifyMarketRegime,
  summarizePortfolio,
  formatKRW,
  scoreInvestorFlow,
  getTrendSignal,
};
