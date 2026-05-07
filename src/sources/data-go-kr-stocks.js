const { normalizeKisTicker } = require('./kis-api');

const DATA_GO_KR_API_KEY = process.env.DATA_GO_KR_API_KEY
  || process.env.PUBLIC_DATA_API_KEY
  || process.env.DATA_GO_KR_SERVICE_KEY
  || '';
const STOCK_PRICE_URL = process.env.DATA_GO_KR_STOCK_PRICE_URL
  || 'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo';

function isDataGoKrConfigured() {
  return Boolean(DATA_GO_KR_API_KEY);
}

function normalizeServiceKey(key) {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function normalizeDate(value) {
  const text = String(value || '').replace(/-/g, '');
  return /^\d{8}$/.test(text) ? text : '';
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const num = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function getItems(data) {
  const items = data?.response?.body?.items?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function rowToQuote(row, ticker) {
  const code = normalizeKisTicker(ticker || row.srtnCd || row.isinCd || '');
  const price = parseNumber(row.clpr);
  if (!code || typeof price !== 'number') return null;

  const basDt = normalizeDate(row.basDt);
  const marketTime = basDt
    ? new Date(`${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}T15:30:00+09:00`).toISOString()
    : new Date().toISOString();

  return {
    symbol: `${code}.KS`,
    ticker: code,
    name: row.itmsNm || '',
    market: row.mrktCtg || 'KR',
    price,
    open: parseNumber(row.mkp),
    high: parseNumber(row.hipr),
    low: parseNumber(row.lopr),
    close: price,
    previousClose: null,
    changePercent: parseNumber(row.fltRt),
    volume: parseNumber(row.trqu),
    tradingValue: parseNumber(row.trPrc),
    currency: 'KRW',
    priceType: 'eod',
    isRealtime: false,
    isAdjusted: false,
    marketTime,
    source: 'data-go-kr',
    raw: row,
  };
}

async function fetchDataGoKrDailyOhlcv(ticker, from, to) {
  const code = normalizeKisTicker(ticker);
  if (!code || !isDataGoKrConfigured()) return [];

  const begin = normalizeDate(from);
  const end = normalizeDate(to || from);
  if (!begin || !end) return [];

  try {
    const url = new URL(STOCK_PRICE_URL);
    url.searchParams.set('serviceKey', normalizeServiceKey(DATA_GO_KR_API_KEY));
    url.searchParams.set('resultType', 'json');
    url.searchParams.set('numOfRows', '1000');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('likeSrtnCd', code);
    url.searchParams.set('beginBasDt', begin);
    url.searchParams.set('endBasDt', end);

    const res = await fetch(url, {
      headers: { 'User-Agent': 'economic-agent/2.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    return getItems(data)
      .map(row => rowToQuote(row, code))
      .filter(Boolean)
      .sort((a, b) => new Date(a.marketTime) - new Date(b.marketTime));
  } catch (err) {
    console.warn(`[공공데이터] ${code} 일별 시세 조회 실패: ${err.message}`);
    return [];
  }
}

async function fetchDataGoKrEodPrice(ticker, date) {
  const rows = await fetchDataGoKrDailyOhlcv(ticker, date, date);
  return rows.at(-1) || null;
}

module.exports = {
  isDataGoKrConfigured,
  normalizeDate,
  rowToQuote,
  fetchDataGoKrDailyOhlcv,
  fetchDataGoKrEodPrice,
};
