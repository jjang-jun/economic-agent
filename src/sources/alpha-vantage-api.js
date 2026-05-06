const ALPHA_VANTAGE_BASE_URL = process.env.ALPHA_VANTAGE_BASE_URL || 'https://www.alphavantage.co/query';
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || process.env.AV_API_KEY || '';

function isAlphaVantageConfigured() {
  return Boolean(ALPHA_VANTAGE_API_KEY);
}

function normalizeAlphaSymbol(symbol) {
  const cleaned = String(symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!cleaned || cleaned.includes('=') || cleaned.startsWith('^') || /^\d{6}(\.(KS|KQ))?$/.test(cleaned)) return '';
  return cleaned;
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[%,$]/g, '').trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

async function fetchAlphaVantageQuote(symbol) {
  const ticker = normalizeAlphaSymbol(symbol);
  if (!ticker || !isAlphaVantageConfigured()) return null;

  try {
    const url = new URL(ALPHA_VANTAGE_BASE_URL);
    url.searchParams.set('function', 'GLOBAL_QUOTE');
    url.searchParams.set('symbol', ticker);
    url.searchParams.set('apikey', ALPHA_VANTAGE_API_KEY);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    if (data.Note || data.Information) throw new Error(data.Note || data.Information);
    const row = data['Global Quote'] || {};
    const price = parseNumber(row['05. price']);
    if (typeof price !== 'number') throw new Error('no price');

    return {
      symbol: row['01. symbol'] || ticker,
      ticker,
      name: '',
      price,
      previousClose: parseNumber(row['08. previous close']),
      changePercent: parseNumber(row['10. change percent']),
      volume: parseNumber(row['06. volume']),
      currency: 'USD',
      market: 'US',
      exchange: '',
      priceType: 'current',
      isRealtime: false,
      isAdjusted: false,
      marketTime: row['07. latest trading day']
        ? `${row['07. latest trading day']}T20:00:00-04:00`
        : new Date().toISOString(),
      source: 'alpha-vantage',
      raw: row,
    };
  } catch (err) {
    console.warn(`[AlphaVantage] ${ticker} 가격 조회 실패: ${err.message}`);
    return null;
  }
}

module.exports = {
  isAlphaVantageConfigured,
  normalizeAlphaSymbol,
  fetchAlphaVantageQuote,
};
