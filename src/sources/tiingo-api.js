const TIINGO_BASE_URL = process.env.TIINGO_BASE_URL || 'https://api.tiingo.com';
const TIINGO_API_TOKEN = process.env.TIINGO_API_TOKEN || process.env.TIINGO_TOKEN || '';

function isTiingoConfigured() {
  return Boolean(TIINGO_API_TOKEN);
}

function normalizeTiingoSymbol(symbol) {
  const raw = String(symbol || '').trim().toLowerCase();
  if (!raw || raw.includes('=') || raw.startsWith('^') || /^\d{6}(\.(ks|kq))?$/.test(raw)) return '';
  const cleaned = raw.replace(/[^a-z0-9.-]/g, '');
  if (!cleaned) return '';
  return cleaned;
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const num = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function getRecentStartDate(days = 14) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

async function fetchTiingoQuote(symbol) {
  const ticker = normalizeTiingoSymbol(symbol);
  if (!ticker || !isTiingoConfigured()) return null;

  try {
    const url = new URL(`/tiingo/daily/${encodeURIComponent(ticker)}/prices`, TIINGO_BASE_URL);
    url.searchParams.set('startDate', getRecentStartDate());
    url.searchParams.set('token', TIINGO_API_TOKEN);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const rows = Array.isArray(data) ? data.filter(Boolean) : [];
    const row = rows[rows.length - 1];
    const previous = rows[rows.length - 2];
    if (!row) throw new Error('no price');

    const price = parseNumber(row.adjClose ?? row.close);
    if (typeof price !== 'number') throw new Error('no close');
    const previousClose = parseNumber(previous?.adjClose ?? previous?.close);
    const changePercent = previousClose
      ? Number((((price - previousClose) / previousClose) * 100).toFixed(2))
      : null;

    return {
      symbol: ticker.toUpperCase(),
      ticker: ticker.toUpperCase(),
      name: '',
      price,
      previousClose,
      changePercent,
      volume: parseNumber(row.volume),
      currency: 'USD',
      market: 'US',
      exchange: '',
      priceType: 'eod',
      isRealtime: false,
      isAdjusted: true,
      marketTime: row.date || new Date().toISOString(),
      source: 'tiingo-eod',
      raw: row,
    };
  } catch (err) {
    console.warn(`[Tiingo] ${ticker} 가격 조회 실패: ${err.message}`);
    return null;
  }
}

module.exports = {
  isTiingoConfigured,
  normalizeTiingoSymbol,
  fetchTiingoQuote,
};
