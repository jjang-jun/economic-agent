const { loadPortfolio } = require('./portfolio');

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

function scoreMarketRegime({ articles, indicators }) {
  const sentiment = countBySentiment(articles);
  const snapshot = indicators.marketSnapshot || [];
  let score = 0;
  const reasons = [];

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

  if (indicators.fedRate && Number(indicators.fedRate) >= 4.5) {
    score -= 1;
    reasons.push(`미국 기준금리 ${indicators.fedRate}%로 고금리 부담`);
  }

  if (score <= -2) return { regime: 'RISK_OFF', score, reasons, sentiment };
  if (score >= 2) return { regime: 'RISK_ON', score, reasons, sentiment };
  return { regime: 'NEUTRAL', score, reasons, sentiment };
}

function summarizePortfolio(portfolio) {
  const positionCount = portfolio.positions.length;
  const cashPct = Math.round((portfolio.cashRatio || 0) * 100);
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
    overweight,
    overweightSectors,
  };
}

function buildActions(regime, portfolio) {
  const summary = summarizePortfolio(portfolio);
  const portfolioChecks = [
    `현재 현금 비중 약 ${summary.cashPct}%, 보유 종목 ${summary.positionCount}개 기준으로 판단`,
    ...summary.overweight.map(item => `${item}: 신규 매수보다 비중 점검 우선`),
    ...summary.overweightSectors.map(item => `${item}: 섹터 쏠림 완화 후보 점검`),
  ];

  if (regime === 'RISK_OFF') {
    return [
      '신규 매수 중단 또는 최소화',
      `보유 종목은 손절 기준(${portfolio.stopLossPct}%)과 악재 공시 여부 우선 점검`,
      '현금 비중 유지, 고변동 성장주는 비중 축소 후보로 분류',
      ...portfolioChecks,
    ];
  }
  if (regime === 'RISK_ON') {
    return [
      `high 확신도 추천만 총 자산의 ${Math.round(portfolio.maxNewBuyRatio * 100)}% 이내 분할 매수 후보`,
      '섹터 쏠림과 종목별 최대 비중을 넘기지 않음',
      '호재 공시가 있는 종목은 다음날 거래량 확인 후 진입',
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
      summary: summarizePortfolio(portfolio),
    },
    actions: buildActions(market.regime, portfolio),
  };
}

module.exports = { buildDecisionContext, scoreMarketRegime, summarizePortfolio };
