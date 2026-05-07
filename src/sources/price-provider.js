const { PRICE_SOURCE_POLICY } = require('../config/price-source-policy');
const { fetchKisCurrentPrice, fetchKisDailyOhlcv, normalizeKisTicker } = require('./kis-api');
const { fetchNaverQuote } = require('./naver-finance');
const { fetchDataGoKrEodPrice, fetchDataGoKrDailyOhlcv } = require('./data-go-kr-stocks');
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

function kisDailyRowToQuote(row, ticker) {
  const code = normalizeKisTicker(ticker);
  if (!code || typeof row?.close !== 'number') return null;
  const date = String(row.date || '');
  const marketTime = /^\d{8}$/.test(date)
    ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T15:30:00+09:00`).toISOString()
    : new Date().toISOString();

  return {
    symbol: `${code}.KS`,
    ticker: code,
    name: '',
    market: 'KR',
    price: row.close,
    open: row.open ?? null,
    high: row.high ?? null,
    low: row.low ?? null,
    close: row.close,
    volume: row.volume ?? null,
    tradingValue: row.tradingValue ?? null,
    currency: 'KRW',
    priceType: 'eod',
    isRealtime: false,
    isAdjusted: false,
    marketTime,
    source: 'kis-rest',
    raw: row,
  };
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

async function fetchDomesticEodPrice(ticker, date) {
  const sources = PRICE_SOURCE_POLICY.eodOfficial.domestic;

  for (const source of sources) {
    let quote = null;
    if (source === 'data-go-kr') quote = await fetchDataGoKrEodPrice(ticker, date);
    if (source === 'kis-rest') {
      const rows = await fetchKisDailyOhlcv(ticker, date, date);
      quote = kisDailyRowToQuote(rows.at(-1), ticker);
    }
    if (quote) {
      quote.sourcePriority = sources;
      await persistQuoteSnapshot(quote, ticker);
      return quote;
    }
  }
  return null;
}

async function fetchDomesticDailyOhlcv(ticker, from, to) {
  const sources = PRICE_SOURCE_POLICY.eodOfficial.domestic;

  for (const source of sources) {
    let rows = [];
    if (source === 'data-go-kr') rows = await fetchDataGoKrDailyOhlcv(ticker, from, to);
    if (source === 'kis-rest') {
      const kisRows = await fetchKisDailyOhlcv(ticker, from, to);
      rows = kisRows.map(row => kisDailyRowToQuote(row, ticker)).filter(Boolean);
    }
    if (rows.length > 0) {
      const snapshots = rows.map(row => toPriceSnapshot({ ...row, sourcePriority: sources }, ticker)).filter(Boolean);
      await persistPriceSnapshots(snapshots);
      return rows;
    }
  }
  return [];
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

async function fetchOfficialEodPrice(ticker, date) {
  const rawTicker = String(ticker || '').trim();
  if (!rawTicker) return null;

  if (isDomesticTicker(rawTicker)) {
    return fetchDomesticEodPrice(rawTicker, date);
  }

  return null;
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
  fetchDomesticEodPrice,
  fetchDomesticDailyOhlcv,
  fetchOfficialEodPrice,
  normalizeYahooSymbol,
  isDomesticTicker,
  toPriceSnapshot,
};
