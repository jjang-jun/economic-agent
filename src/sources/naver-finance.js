function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const num = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function isKoreanTicker(ticker) {
  return Boolean(normalizeNaverTicker(ticker));
}

function normalizeNaverTicker(ticker) {
  const match = String(ticker || '').trim().toUpperCase().match(/^(\d{6})(?:\.(?:KS|KQ))?$/);
  return match ? match[1] : '';
}

async function fetchNaverQuote(ticker) {
  const code = normalizeNaverTicker(ticker);
  if (!code) return null;

  try {
    const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${encodeURIComponent(code)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'economic-agent/2.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const row = data.datas?.[0];
    if (!row) throw new Error('no quote data');
    const price = parseNumber(row.closePriceRaw || row.closePrice);
    if (typeof price !== 'number') throw new Error('no price');

    const previousDiff = parseNumber(row.compareToPreviousClosePriceRaw || row.compareToPreviousClosePrice);
    const previousClose = typeof previousDiff === 'number' ? price - previousDiff : null;
    const changePercent = parseNumber(row.fluctuationsRatioRaw || row.fluctuationsRatio);
    const volume = parseNumber(row.accumulatedTradingVolumeRaw || row.accumulatedTradingVolume);
    const accumulatedTradingValue = parseNumber(row.accumulatedTradingValueRaw);

    return {
      symbol: `${code}.KS`,
      ticker: code,
      name: row.stockName || '',
      price,
      previousClose,
      changePercent,
      volume,
      averageTurnover20d: accumulatedTradingValue || null,
      currency: row.currencyType?.name || 'KRW',
      marketTime: row.localTradedAt ? new Date(row.localTradedAt).toISOString() : new Date().toISOString(),
      marketStatus: row.marketStatus || '',
      source: 'naver-finance',
    };
  } catch (err) {
    console.warn(`[Naver] ${code} 가격 조회 실패: ${err.message}`);
    return null;
  }
}

module.exports = {
  fetchNaverQuote,
  isKoreanTicker,
  normalizeNaverTicker,
};
