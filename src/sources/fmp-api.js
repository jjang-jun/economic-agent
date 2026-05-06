const FMP_BASE_URL = process.env.FMP_BASE_URL || 'https://financialmodelingprep.com/stable';
const FMP_API_KEY = process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || '';

function isFmpConfigured() {
  return Boolean(FMP_API_KEY);
}

function normalizeFmpSymbol(symbol) {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw || raw.includes('=') || raw.startsWith('^') || /^\d{6}(\.(KS|KQ))?$/.test(raw)) return '';
  const cleaned = raw.replace(/[^A-Z0-9.-]/g, '');
  if (!cleaned) return '';
  return cleaned;
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const num = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

async function fetchFmpQuote(symbol) {
  const ticker = normalizeFmpSymbol(symbol);
  if (!ticker || !isFmpConfigured()) return null;

  try {
    const url = new URL('/quote', FMP_BASE_URL);
    url.searchParams.set('symbol', ticker);
    url.searchParams.set('apikey', FMP_API_KEY);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('no quote');

    const price = parseNumber(row.price);
    if (typeof price !== 'number') throw new Error('no price');

    const previousClose = parseNumber(row.previousClose);
    const changePercent = parseNumber(row.changesPercentage);
    const marketTime = row.timestamp
      ? new Date(Number(row.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    return {
      symbol: row.symbol || ticker,
      ticker,
      name: row.name || '',
      price,
      previousClose,
      changePercent,
      volume: parseNumber(row.volume),
      currency: row.currency || 'USD',
      market: 'US',
      exchange: row.exchange || row.exchangeShortName || '',
      priceType: 'current',
      isRealtime: true,
      isAdjusted: false,
      marketTime,
      source: 'fmp',
      raw: row,
    };
  } catch (err) {
    console.warn(`[FMP] ${ticker} 가격 조회 실패: ${err.message}`);
    return null;
  }
}

async function fetchFmpProfile(symbol) {
  const ticker = normalizeFmpSymbol(symbol);
  if (!ticker || !isFmpConfigured()) return null;

  try {
    const url = new URL('/profile', FMP_BASE_URL);
    url.searchParams.set('symbol', ticker);
    url.searchParams.set('apikey', FMP_API_KEY);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    return Array.isArray(data) ? data[0] || null : data;
  } catch (err) {
    console.warn(`[FMP] ${ticker} profile 조회 실패: ${err.message}`);
    return null;
  }
}

module.exports = {
  isFmpConfigured,
  normalizeFmpSymbol,
  fetchFmpQuote,
  fetchFmpProfile,
};
