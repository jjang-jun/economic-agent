const { normalizeKisTicker } = require('./kis-api');
const { normalizeDate } = require('./data-go-kr-stocks');

const KRX_API_KEY = process.env.KRX_OPENAPI_KEY
  || process.env.KRX_API_KEY
  || process.env.KRX_AUTH_KEY
  || '';
const KRX_BASE_URL = String(process.env.KRX_OPENAPI_BASE_URL || 'https://data-dbg.krx.co.kr/svc/apis')
  .replace(/\/+$/, '');

const MARKET_ENDPOINTS = [
  { market: 'KOSPI', path: '/sto/stk_bydd_trd' },
  { market: 'KOSDAQ', path: '/sto/ksq_bydd_trd' },
];

function isKrxConfigured() {
  return Boolean(KRX_API_KEY && KRX_BASE_URL);
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').trim();
  if (normalized === '' || normalized === '-') return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function compactDate(value) {
  return normalizeDate(value);
}

function toMarketTime(basDd) {
  const date = compactDate(basDd);
  return date
    ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T15:30:00+09:00`).toISOString()
    : new Date().toISOString();
}

function getRows(data) {
  const rows = data?.OutBlock_1 || data?.outBlock1 || data?.output || data?.items;
  if (!rows) return [];
  return Array.isArray(rows) ? rows : [rows];
}

function rowToQuote(row = {}, options = {}) {
  const code = normalizeKisTicker(
    row.ISU_CD
    || row.ISU_SRT_CD
    || row.SHRT_CODE
    || row.srtnCd
    || ''
  );
  const close = parseNumber(row.TDD_CLSPRC || row.CLSPRC || row.clpr);
  if (!code || typeof close !== 'number') return null;

  const basDd = compactDate(options.basDd || row.BAS_DD || row.basDd);
  const market = options.market || row.MKT_NM || row.MRKT_NM || row.mrktCtg || 'KR';

  return {
    symbol: `${code}.KS`,
    ticker: code,
    name: row.ISU_NM || row.ITMS_NM || row.itmsNm || '',
    market,
    price: close,
    open: parseNumber(row.TDD_OPNPRC || row.OPNPRC || row.mkp),
    high: parseNumber(row.TDD_HGPRC || row.HGPRC || row.hipr),
    low: parseNumber(row.TDD_LWPRC || row.LWPRC || row.lopr),
    close,
    previousClose: null,
    changePercent: parseNumber(row.FLUC_RT || row.fltRt),
    volume: parseNumber(row.ACC_TRDVOL || row.TRDVOL || row.trqu),
    tradingValue: parseNumber(row.ACC_TRDVAL || row.TRDVAL || row.trPrc),
    marketCap: parseNumber(row.MKTCAP),
    listedShares: parseNumber(row.LIST_SHRS),
    currency: 'KRW',
    priceType: 'eod',
    isRealtime: false,
    isAdjusted: false,
    marketTime: toMarketTime(basDd),
    source: 'krx-openapi',
    raw: row,
  };
}

async function fetchKrxMarketDailyQuotes({ basDd, market, path, ticker = '' }) {
  const date = compactDate(basDd);
  if (!date || !isKrxConfigured()) return [];

  try {
    const url = new URL(`${KRX_BASE_URL}${path}`);
    url.searchParams.set('basDd', date);

    const res = await fetch(url, {
      headers: {
        AUTH_KEY: KRX_API_KEY,
        Accept: 'application/json',
        'User-Agent': 'economic-agent/2.0',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    return getRows(data)
      .map(row => rowToQuote(row, { basDd: date, market, ticker }))
      .filter(Boolean);
  } catch (err) {
    console.warn(`[KRX] ${market} ${date} 일별매매정보 조회 실패: ${err.message}`);
    return [];
  }
}

async function fetchKrxDailyQuotesByDate(basDd, ticker = '') {
  const code = normalizeKisTicker(ticker);
  const results = [];

  for (const endpoint of MARKET_ENDPOINTS) {
    const rows = await fetchKrxMarketDailyQuotes({
      basDd,
      ticker: code,
      ...endpoint,
    });
    results.push(...(code ? rows.filter(row => row.ticker === code) : rows));
    if (code && results.length > 0) break;
  }

  return results.sort((a, b) => new Date(a.marketTime) - new Date(b.marketTime));
}

function addDays(date, days) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateToCompact(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}

function eachWeekday(from, to) {
  const start = compactDate(from);
  const end = compactDate(to || from);
  if (!start || !end) return [];

  let cursor = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(4, 6)) - 1, Number(start.slice(6, 8))));
  const endDate = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(4, 6)) - 1, Number(end.slice(6, 8))));
  const dates = [];

  while (cursor <= endDate) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(dateToCompact(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

async function fetchKrxDailyOhlcv(ticker, from, to) {
  const code = normalizeKisTicker(ticker);
  if (!code || !isKrxConfigured()) return [];

  const rows = [];
  for (const basDd of eachWeekday(from, to || from)) {
    const dayRows = await fetchKrxDailyQuotesByDate(basDd, code);
    rows.push(...dayRows);
  }

  return rows.sort((a, b) => new Date(a.marketTime) - new Date(b.marketTime));
}

async function fetchKrxEodPrice(ticker, date) {
  const rows = await fetchKrxDailyOhlcv(ticker, date, date);
  return rows.at(-1) || null;
}

module.exports = {
  isKrxConfigured,
  parseNumber,
  rowToQuote,
  eachWeekday,
  fetchKrxDailyQuotesByDate,
  fetchKrxDailyOhlcv,
  fetchKrxEodPrice,
};
