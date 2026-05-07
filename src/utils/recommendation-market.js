const { fetchCurrentPrice, fetchBenchmarkQuote, normalizeYahooSymbol } = require('../sources/price-provider');
const {
  fetchFmpProfile,
  fetchFmpFundamentalSummary,
  fetchFmpEarningsSummary,
  normalizeFmpSymbol,
} = require('../sources/fmp-api');

const MIN_AVG_TURNOVER_KRW = 5000000000;

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
    price: quote.price,
    changePercent: quote.changePercent,
    return5dPct: quote.return5dPct,
    return20dPct: quote.return20dPct,
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
      return symbol ? fetchCurrentPrice(symbol) : null;
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
  buildMarketProfile,
  buildFundamentalProfile,
  applyRecommendationMarketData,
};
