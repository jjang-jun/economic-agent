const OFFICIAL_TICKER_NAMES = {
  '011210': '현대위아',
  '011210.KS': '현대위아',
};

function officialTickerName(ticker) {
  const raw = String(ticker || '').trim().toUpperCase();
  const compact = raw.replace(/\.(KS|KQ)$/i, '');
  return OFFICIAL_TICKER_NAMES[raw] || OFFICIAL_TICKER_NAMES[compact] || '';
}

module.exports = {
  OFFICIAL_TICKER_NAMES,
  officialTickerName,
};
