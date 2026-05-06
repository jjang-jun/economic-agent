const { fetchNaverQuote, normalizeNaverTicker } = require('./naver-finance');

function normalizeYahooSymbol(ticker) {
  if (!ticker) return '';

  const cleaned = String(ticker).trim().replace(/[^0-9A-Za-z.^=-]/g, '');
  if (!cleaned) return '';
  if (cleaned.includes('.')) return cleaned.toUpperCase();
  if (/^\d{6}$/.test(cleaned)) return `${cleaned}.KS`;
  return cleaned.toUpperCase();
}

async function fetchQuote(ticker) {
  const rawTicker = String(ticker || '').trim();
  const domesticTicker = normalizeNaverTicker(rawTicker);
  const naverQuote = domesticTicker ? await fetchNaverQuote(domesticTicker) : null;
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
    const timestamps = result.timestamp || [];
    const rawCloses = quote.close || [];
    const rawHighs = quote.high || [];
    const rawLows = quote.low || [];
    const rawVolumes = quote.volume || [];
    const closes = rawCloses.filter(v => typeof v === 'number');
    const highs = rawHighs.filter(v => typeof v === 'number');
    const volumes = rawVolumes.filter(v => typeof v === 'number');
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
    const volume = meta.regularMarketVolume || volumes[volumes.length - 1] || null;
    const avgVolume20d = calculateAverage(volumes, 20);
    const volumeRatio20d = volume && avgVolume20d
      ? Number((volume / avgVolume20d).toFixed(2))
      : null;
    const averageTurnover20d = avgVolume20d && price
      ? Math.round(avgVolume20d * price)
      : null;
    const high20d = calculatePeriodHigh(highs, 20);
    const high60d = calculatePeriodHigh(highs, 60);
    const priorHigh20d = calculatePeriodHigh(highs.slice(0, -1), 20);
    const distanceFrom20dHighPct = high20d
      ? Number((((price - high20d) / high20d) * 100).toFixed(2))
      : null;
    const distanceFrom60dHighPct = high60d
      ? Number((((price - high60d) / high60d) * 100).toFixed(2))
      : null;
    const near20dHigh = typeof distanceFrom20dHighPct === 'number'
      ? distanceFrom20dHighPct >= -3
      : null;
    const breakout20d = priorHigh20d
      ? price >= priorHigh20d
      : null;
    const history = timestamps
      .map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString(),
        close: rawCloses[index],
        high: rawHighs[index],
        low: rawLows[index],
        volume: rawVolumes[index],
      }))
      .filter(row => typeof row.close === 'number');

    const yahooQuote = {
      symbol,
      price,
      previousClose,
      changePercent,
      return5dPct,
      return20dPct,
      volume,
      avgVolume20d,
      volumeRatio20d,
      averageTurnover20d,
      high20d,
      high60d,
      distanceFrom20dHighPct,
      distanceFrom60dHighPct,
      near20dHigh,
      breakout20d,
      history,
      currency: meta.currency || '',
      marketTime: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
      source: 'yahoo-finance',
    };
    if (naverQuote) {
      return {
        ...yahooQuote,
        ...naverQuote,
        symbol,
        return5dPct: null,
        return20dPct: null,
        history: [],
        high20d: null,
        high60d: null,
        distanceFrom20dHighPct: null,
        distanceFrom60dHighPct: null,
        near20dHigh: null,
        breakout20d: null,
        source: 'naver-finance',
        fallbackSource: 'yahoo-finance',
      };
    }
    return yahooQuote;
  } catch (err) {
    console.warn(`[Yahoo] ${symbol} 가격 조회 실패: ${err.message}`);
    return naverQuote || null;
  }
}

function calculateAverage(values, days) {
  const recent = values.slice(-days).filter(v => typeof v === 'number');
  if (recent.length === 0) return null;
  return Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length);
}

function calculatePeriodHigh(values, days) {
  const recent = values.slice(-days).filter(v => typeof v === 'number');
  if (recent.length === 0) return null;
  return Math.max(...recent);
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

module.exports = {
  fetchQuote,
  fetchBenchmarkQuote,
  normalizeYahooSymbol,
  calculatePeriodReturn,
  calculateAverage,
  calculatePeriodHigh,
};
