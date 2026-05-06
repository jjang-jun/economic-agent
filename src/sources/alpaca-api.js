const ALPACA_DATA_BASE_URL = process.env.ALPACA_DATA_BASE_URL || 'https://data.alpaca.markets';
const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID || process.env.APCA_API_KEY_ID || '';
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY || process.env.APCA_API_SECRET_KEY || '';
const ALPACA_DATA_FEED = process.env.ALPACA_DATA_FEED || 'iex';

function isAlpacaConfigured() {
  return Boolean(ALPACA_API_KEY_ID && ALPACA_API_SECRET_KEY);
}

function normalizeUsSymbol(symbol) {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw || raw.includes('=') || raw.startsWith('^') || /^\d{6}(\.(KS|KQ))?$/.test(raw)) return '';
  const cleaned = raw.replace(/[^A-Z0-9.-]/g, '');
  if (!cleaned) return '';
  return cleaned;
}

function roundPct(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(2))
    : null;
}

async function fetchAlpacaQuote(symbol) {
  const ticker = normalizeUsSymbol(symbol);
  if (!ticker || !isAlpacaConfigured()) return null;

  try {
    const url = new URL('/v2/stocks/snapshots', ALPACA_DATA_BASE_URL);
    url.searchParams.set('symbols', ticker);
    url.searchParams.set('feed', ALPACA_DATA_FEED);

    const res = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': ALPACA_API_KEY_ID,
        'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const row = data[ticker] || data.snapshots?.[ticker];
    if (!row) throw new Error('no snapshot');

    const trade = row.latestTrade || {};
    const daily = row.dailyBar || {};
    const previous = row.prevDailyBar || {};
    const price = trade.p ?? daily.c ?? null;
    if (typeof price !== 'number') throw new Error('no price');

    const previousClose = previous.c ?? null;
    const changePercent = previousClose
      ? roundPct(((price - previousClose) / previousClose) * 100)
      : null;

    return {
      symbol: ticker,
      ticker,
      name: '',
      price,
      previousClose,
      changePercent,
      volume: daily.v ?? null,
      currency: 'USD',
      market: 'US',
      exchange: '',
      priceType: 'current',
      isRealtime: ALPACA_DATA_FEED === 'sip' || ALPACA_DATA_FEED === 'iex',
      isAdjusted: false,
      marketTime: trade.t || daily.t || new Date().toISOString(),
      source: `alpaca-${ALPACA_DATA_FEED}`,
      raw: row,
    };
  } catch (err) {
    console.warn(`[Alpaca] ${ticker} 가격 조회 실패: ${err.message}`);
    return null;
  }
}

module.exports = {
  isAlpacaConfigured,
  normalizeUsSymbol,
  fetchAlpacaQuote,
};
