function normalizeYahooSymbol(ticker) {
  if (!ticker) return '';

  const cleaned = String(ticker).trim().replace(/[^0-9A-Za-z.^=-]/g, '');
  if (!cleaned) return '';
  if (cleaned.includes('.')) return cleaned.toUpperCase();
  if (/^\d{6}$/.test(cleaned)) return `${cleaned}.KS`;
  return cleaned.toUpperCase();
}

async function fetchQuote(ticker) {
  const symbol = normalizeYahooSymbol(ticker);
  if (!symbol) return null;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'economic-agent/2.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) throw new Error(data.chart?.error?.description || 'no chart result');

    const meta = result.meta || {};
    const quote = result.indicators?.quote?.[0] || {};
    const closes = (quote.close || []).filter(v => typeof v === 'number');
    const price = meta.regularMarketPrice || closes[closes.length - 1];
    if (typeof price !== 'number') throw new Error('no price');
    const previousClose = meta.previousClose || closes[closes.length - 2] || null;
    const changePercent = typeof meta.regularMarketChangePercent === 'number'
      ? Number(meta.regularMarketChangePercent.toFixed(2))
      : previousClose
        ? Number((((price - previousClose) / previousClose) * 100).toFixed(2))
        : null;
    const return5dPct = calculatePeriodReturn(price, closes, 5);
    const return20dPct = calculatePeriodReturn(price, closes, 20);

    return {
      symbol,
      price,
      previousClose,
      changePercent,
      return5dPct,
      return20dPct,
      currency: meta.currency || '',
      marketTime: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[Yahoo] ${symbol} 가격 조회 실패: ${err.message}`);
    return null;
  }
}

function calculatePeriodReturn(price, closes, days) {
  if (typeof price !== 'number' || closes.length <= days) return null;
  const base = closes[closes.length - 1 - days];
  if (typeof base !== 'number' || base === 0) return null;
  return Number((((price - base) / base) * 100).toFixed(2));
}

async function fetchBenchmarkQuote() {
  return fetchQuote('^KS11');
}

module.exports = { fetchQuote, fetchBenchmarkQuote, normalizeYahooSymbol, calculatePeriodReturn };
