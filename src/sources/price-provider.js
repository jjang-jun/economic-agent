const { PRICE_SOURCE_POLICY } = require('../config/price-source-policy');
const { fetchKisCurrentPrice, normalizeKisTicker } = require('./kis-api');
const { fetchNaverQuote } = require('./naver-finance');
const { fetchAlpacaQuote } = require('./alpaca-api');
const { fetchFmpQuote } = require('./fmp-api');
const { fetchAlphaVantageQuote } = require('./alpha-vantage-api');
const { fetchTiingoQuote } = require('./tiingo-api');
const {
  fetchQuote: fetchYahooQuote,
  fetchBenchmarkQuote: fetchYahooBenchmarkQuote,
  normalizeYahooSymbol,
} = require('./yahoo-finance');
const { persistPriceSnapshots } = require('../utils/persistence');

function isDomesticTicker(ticker) {
  return Boolean(normalizeKisTicker(ticker));
}

function toPriceSnapshot(quote, requestedSymbol = '') {
  if (!quote || typeof quote.price !== 'number') return null;
  const asOf = quote.marketTime || new Date().toISOString();
  return {
    ticker: quote.ticker || requestedSymbol || quote.symbol || '',
    symbol: quote.symbol || requestedSymbol || '',
    name: quote.name || '',
    market: quote.market || (isDomesticTicker(quote.ticker || quote.symbol) ? 'KR' : ''),
    price: quote.price,
    open: quote.open ?? null,
    high: quote.high ?? null,
    low: quote.low ?? null,
    close: quote.close ?? quote.price,
    volume: quote.volume ?? null,
    tradingValue: quote.tradingValue ?? quote.averageTurnover20d ?? null,
    currency: quote.currency || '',
    source: quote.source || '',
    priceType: quote.priceType || 'current',
    isRealtime: quote.isRealtime ?? false,
    isAdjusted: quote.isAdjusted ?? false,
    asOf,
    payload: quote,
  };
}

async function persistQuoteSnapshot(quote, requestedSymbol) {
  const snapshot = toPriceSnapshot(quote, requestedSymbol);
  if (!snapshot) return;
  await persistPriceSnapshots([snapshot]);
}

async function fetchDomesticCurrentPrice(ticker) {
  const sources = PRICE_SOURCE_POLICY.currentPrice.domestic;

  for (const source of sources) {
    let quote = null;
    if (source === 'kis-rest') quote = await fetchKisCurrentPrice(ticker);
    if (source === 'naver-finance') quote = await fetchNaverQuote(ticker);
    if (source === 'yahoo-finance') quote = await fetchYahooQuote(ticker);
    if (quote) {
      quote.sourcePriority = sources;
      await persistQuoteSnapshot(quote, ticker);
      return quote;
    }
  }
  return null;
}

async function fetchGlobalCurrentPrice(ticker) {
  const sources = PRICE_SOURCE_POLICY.currentPrice.global;

  for (const source of sources) {
    let quote = null;
    if (source === 'alpaca-market-data') quote = await fetchAlpacaQuote(ticker);
    if (source === 'fmp') quote = await fetchFmpQuote(ticker);
    if (source === 'alpha-vantage') quote = await fetchAlphaVantageQuote(ticker);
    if (source === 'tiingo-eod') quote = await fetchTiingoQuote(ticker);
    if (source === 'yahoo-finance') quote = await fetchYahooQuote(ticker);
    if (quote) {
      quote.sourcePriority = sources;
      await persistQuoteSnapshot(quote, ticker);
      return quote;
    }
  }
  return null;
}

async function fetchCurrentPrice(ticker) {
  const rawTicker = String(ticker || '').trim();
  if (!rawTicker) return null;

  if (isDomesticTicker(rawTicker)) {
    return fetchDomesticCurrentPrice(rawTicker);
  }

  return fetchGlobalCurrentPrice(rawTicker);
}

async function fetchBenchmarkQuote() {
  const quote = await fetchYahooBenchmarkQuote();
  if (quote) await persistQuoteSnapshot(quote, '^KS11');
  return quote;
}

module.exports = {
  PRICE_SOURCE_POLICY,
  fetchCurrentPrice,
  fetchBenchmarkQuote,
  fetchGlobalCurrentPrice,
  normalizeYahooSymbol,
  isDomesticTicker,
  toPriceSnapshot,
};
