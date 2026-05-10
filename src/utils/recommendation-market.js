const {
  fetchCurrentPrice,
  fetchBenchmarkQuote,
  normalizeYahooSymbol,
  isDomesticTicker,
} = require('../sources/price-provider');
const { fetchQuote: fetchYahooQuote } = require('../sources/yahoo-finance');
const {
  fetchFmpProfile,
  fetchFmpFundamentalSummary,
  fetchFmpEarningsSummary,
  normalizeFmpSymbol,
} = require('../sources/fmp-api');

const MIN_AVG_TURNOVER_KRW = 5000000000;
const ENTRY_TIMING_LABELS = {
  breakout: '돌파 분할매수',
  pullback: '눌림목 분할매수',
  wait_pullback: '과열, 눌림 대기',
  wait_confirmation: '확인 대기',
  avoid: '매수 보류',
};

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildEntryTimingProfile(quote, { relativeStrength20d = null } = {}) {
  if (!quote) return null;

  const reasons = [];
  const warnings = [];
  let score = 0;

  if (quote.priceAboveMa5 === true) {
    score += 1;
    reasons.push('종가가 5일선 위');
  } else if (quote.priceAboveMa5 === false) {
    warnings.push('종가가 5일선 아래');
  }

  if (quote.priceAboveMa20 === true) {
    score += 1;
    reasons.push('종가가 20일선 위');
  } else if (quote.priceAboveMa20 === false) {
    score -= 2;
    warnings.push('종가가 20일선 아래');
  }

  if (quote.ma5AboveMa20 === true) {
    score += 1;
    reasons.push('5일선이 20일선 위');
  } else if (quote.ma5AboveMa20 === false) {
    warnings.push('5일선이 20일선 아래');
  }

  if (typeof quote.ma20Slope5dPct === 'number') {
    if (quote.ma20Slope5dPct > 0) {
      score += 1;
      reasons.push(`20일선 5일 기울기 +${quote.ma20Slope5dPct}%`);
    } else {
      score -= 1;
      warnings.push(`20일선 5일 기울기 ${quote.ma20Slope5dPct}%`);
    }
  }

  if (typeof relativeStrength20d === 'number') {
    if (relativeStrength20d >= 0) {
      score += 1;
      reasons.push(`20일 상대강도 +${relativeStrength20d}%p`);
    } else {
      warnings.push(`20일 상대강도 ${relativeStrength20d}%p`);
    }
  }

  const volumeConfirmed = typeof quote.volumeRatio20d === 'number' ? quote.volumeRatio20d >= 1.2 : null;
  const nearMa20 = typeof quote.distanceFromMa20Pct === 'number'
    ? quote.distanceFromMa20Pct >= -1.5 && quote.distanceFromMa20Pct <= 3
    : false;
  const extendedFromMa20 = typeof quote.distanceFromMa20Pct === 'number'
    ? quote.distanceFromMa20Pct >= 8
    : false;

  let action = 'wait_confirmation';
  if (quote.priceAboveMa20 === false || quote.ma5AboveMa20 === false) {
    action = 'avoid';
  } else if (extendedFromMa20) {
    action = 'wait_pullback';
    warnings.push(`20일선 대비 ${quote.distanceFromMa20Pct}% 위: 추격매수 위험`);
  } else if (quote.breakout20d && volumeConfirmed !== false) {
    action = 'breakout';
    reasons.push('20일 고점 돌파');
    if (volumeConfirmed === true) reasons.push(`거래량 ${quote.volumeRatio20d}배`);
  } else if (nearMa20 && quote.priceAboveMa20 !== false) {
    action = 'pullback';
    reasons.push(`20일선 근처 ${quote.distanceFromMa20Pct}%`);
  } else if (score >= 4) {
    action = 'pullback';
  }

  return {
    action,
    label: ENTRY_TIMING_LABELS[action],
    approved: ['breakout', 'pullback'].includes(action),
    score,
    priceAboveMa5: quote.priceAboveMa5,
    priceAboveMa20: quote.priceAboveMa20,
    ma5AboveMa20: quote.ma5AboveMa20,
    movingAverage5d: quote.movingAverage5d,
    movingAverage20d: quote.movingAverage20d,
    distanceFromMa5Pct: quote.distanceFromMa5Pct,
    distanceFromMa20Pct: quote.distanceFromMa20Pct,
    ma20Slope5dPct: quote.ma20Slope5dPct,
    volumeConfirmed,
    reasons,
    warnings,
  };
}

function buildMarketProfile(quote, benchmark) {
  if (!quote) return null;
  const relativeStrength20d = typeof quote.return20dPct === 'number' && typeof benchmark?.return20dPct === 'number'
    ? round(quote.return20dPct - benchmark.return20dPct)
    : null;
  const relativeStrength5d = typeof quote.return5dPct === 'number' && typeof benchmark?.return5dPct === 'number'
    ? round(quote.return5dPct - benchmark.return5dPct)
    : null;
  const liquid = typeof quote.averageTurnover20d === 'number'
    ? quote.averageTurnover20d >= MIN_AVG_TURNOVER_KRW
    : null;

  return {
    symbol: quote.symbol,
    name: quote.name || '',
    price: quote.price,
    changePercent: quote.changePercent,
    return5dPct: quote.return5dPct,
    return20dPct: quote.return20dPct,
    movingAverage5d: quote.movingAverage5d,
    movingAverage20d: quote.movingAverage20d,
    distanceFromMa5Pct: quote.distanceFromMa5Pct,
    distanceFromMa20Pct: quote.distanceFromMa20Pct,
    ma20Slope5dPct: quote.ma20Slope5dPct,
    priceAboveMa5: quote.priceAboveMa5,
    priceAboveMa20: quote.priceAboveMa20,
    ma5AboveMa20: quote.ma5AboveMa20,
    benchmarkSymbol: benchmark?.symbol || '^KS11',
    benchmarkReturn5dPct: benchmark?.return5dPct ?? null,
    benchmarkReturn20dPct: benchmark?.return20dPct ?? null,
    relativeStrength5d,
    relativeStrength20d,
    volume: quote.volume,
    avgVolume20d: quote.avgVolume20d,
    volumeRatio20d: quote.volumeRatio20d,
    averageTurnover20d: quote.averageTurnover20d,
    high20d: quote.high20d,
    high60d: quote.high60d,
    distanceFrom20dHighPct: quote.distanceFrom20dHighPct,
    distanceFrom60dHighPct: quote.distanceFrom60dHighPct,
    near20dHigh: quote.near20dHigh,
    breakout20d: quote.breakout20d,
    entryTiming: buildEntryTimingProfile(quote, { relativeStrength20d }),
    liquid,
    liquidityThreshold: MIN_AVG_TURNOVER_KRW,
  };
}

function buildFundamentalProfile(profile, summary = null, earnings = null) {
  if (!profile) return null;
  const marketCap = Number.isFinite(Number(profile.marketCap)) ? Number(profile.marketCap) : null;
  const beta = Number.isFinite(Number(profile.beta)) ? Number(profile.beta) : null;

  return {
    symbol: profile.symbol || '',
    name: profile.companyName || '',
    sector: profile.sector || '',
    industry: profile.industry || '',
    country: profile.country || '',
    exchange: profile.exchange || profile.exchangeFullName || '',
    currency: profile.currency || '',
    marketCap,
    marketCapUsd: profile.currency === 'USD' ? marketCap : null,
    beta,
    isEtf: profile.isEtf ?? null,
    isAdr: profile.isAdr ?? null,
    isFund: profile.isFund ?? null,
    isActivelyTrading: profile.isActivelyTrading ?? null,
    ipoDate: profile.ipoDate || '',
    statements: summary,
    earnings,
    source: 'fmp-profile',
  };
}

function mergeTechnicalQuote(currentQuote, technicalQuote) {
  if (!currentQuote) return technicalQuote || null;
  if (!technicalQuote) return currentQuote;
  const price = typeof currentQuote.price === 'number' ? currentQuote.price : technicalQuote.price;
  const high20d = technicalQuote.high20d;
  const high60d = technicalQuote.high60d;
  const movingAverage5d = technicalQuote.movingAverage5d;
  const movingAverage20d = technicalQuote.movingAverage20d;
  const distanceFromMa5Pct = movingAverage5d && typeof price === 'number'
    ? round(((price - movingAverage5d) / movingAverage5d) * 100)
    : technicalQuote.distanceFromMa5Pct;
  const distanceFromMa20Pct = movingAverage20d && typeof price === 'number'
    ? round(((price - movingAverage20d) / movingAverage20d) * 100)
    : technicalQuote.distanceFromMa20Pct;
  const distanceFrom20dHighPct = high20d && typeof price === 'number'
    ? round(((price - high20d) / high20d) * 100)
    : technicalQuote.distanceFrom20dHighPct;
  const distanceFrom60dHighPct = high60d && typeof price === 'number'
    ? round(((price - high60d) / high60d) * 100)
    : technicalQuote.distanceFrom60dHighPct;

  return {
    ...technicalQuote,
    ...currentQuote,
    symbol: currentQuote.symbol || technicalQuote.symbol,
    name: currentQuote.name || technicalQuote.name || '',
    price,
    return5dPct: technicalQuote.return5dPct ?? currentQuote.return5dPct,
    return20dPct: technicalQuote.return20dPct ?? currentQuote.return20dPct,
    movingAverage5d,
    movingAverage20d,
    distanceFromMa5Pct,
    distanceFromMa20Pct,
    ma20Slope5dPct: technicalQuote.ma20Slope5dPct ?? currentQuote.ma20Slope5dPct,
    priceAboveMa5: typeof distanceFromMa5Pct === 'number' ? distanceFromMa5Pct >= 0 : technicalQuote.priceAboveMa5,
    priceAboveMa20: typeof distanceFromMa20Pct === 'number' ? distanceFromMa20Pct >= 0 : technicalQuote.priceAboveMa20,
    ma5AboveMa20: technicalQuote.ma5AboveMa20 ?? currentQuote.ma5AboveMa20,
    high20d,
    high60d,
    distanceFrom20dHighPct,
    distanceFrom60dHighPct,
    near20dHigh: typeof distanceFrom20dHighPct === 'number' ? distanceFrom20dHighPct >= -3 : technicalQuote.near20dHigh,
    breakout20d: technicalQuote.breakout20d === true
      ? true
      : (high20d && typeof price === 'number' ? price >= high20d : technicalQuote.breakout20d),
    history: technicalQuote.history || currentQuote.history || [],
    fallbackSource: technicalQuote.source || currentQuote.fallbackSource || '',
  };
}

async function fetchRecommendationQuote(symbol) {
  if (!symbol) return null;
  const currentQuote = await fetchCurrentPrice(symbol);
  if (!isDomesticTicker(symbol)) return currentQuote;

  const needsTechnical = !currentQuote
    || typeof currentQuote.movingAverage20d !== 'number'
    || typeof currentQuote.high20d !== 'number';
  if (!needsTechnical) return currentQuote;

  try {
    const technicalQuote = await fetchYahooQuote(symbol);
    return mergeTechnicalQuote(currentQuote, technicalQuote);
  } catch {
    return currentQuote;
  }
}

async function fetchFundamentalProfile(stock) {
  const symbol = normalizeFmpSymbol(stock.ticker || stock.symbol || '');
  if (!symbol) return null;
  const [profile, summary, earnings] = await Promise.all([
    fetchFmpProfile(symbol),
    fetchFmpFundamentalSummary(symbol),
    fetchFmpEarningsSummary(symbol),
  ]);
  return buildFundamentalProfile(profile, summary, earnings);
}

async function applyRecommendationMarketData(report) {
  if (!report?.stocks?.length) return report;
  const benchmark = await fetchBenchmarkQuote();
  const [quotes, fundamentals] = await Promise.all([
    Promise.all(report.stocks.map(stock => {
      const symbol = normalizeYahooSymbol(stock.ticker || stock.symbol || '');
      return symbol ? fetchRecommendationQuote(symbol) : null;
    })),
    Promise.all(report.stocks.map(stock => fetchFundamentalProfile(stock))),
  ]);

  report.stocks = report.stocks.map((stock, index) => ({
    ...stock,
    market_profile: buildMarketProfile(quotes[index], benchmark),
    fundamental_profile: fundamentals[index],
  }));
  return report;
}

module.exports = {
  MIN_AVG_TURNOVER_KRW,
  ENTRY_TIMING_LABELS,
  buildEntryTimingProfile,
  buildMarketProfile,
  buildFundamentalProfile,
  mergeTechnicalQuote,
  fetchRecommendationQuote,
  applyRecommendationMarketData,
};
