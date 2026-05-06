const WATCHLIST = require('../config/watchlist');
const { fetchCurrentPrice } = require('../sources/price-provider');

function getSymbolsForSession(session) {
  const primary = WATCHLIST[session] || [];
  const bySymbol = new Map();
  for (const item of [...primary, ...WATCHLIST.global]) {
    if (!bySymbol.has(item.symbol)) bySymbol.set(item.symbol, item);
  }
  return [...bySymbol.values()];
}

async function fetchMarketSnapshot(session) {
  const items = getSymbolsForSession(session);
  if (items.length === 0) return [];

  const results = await Promise.allSettled(
    items.map(async item => {
      const quote = await fetchCurrentPrice(item.symbol);
      if (!quote) return null;
      return {
        name: item.name,
        symbol: quote.symbol,
        price: quote.price,
        previousClose: quote.previousClose,
        changePercent: quote.changePercent,
        return5dPct: quote.return5dPct,
        return20dPct: quote.return20dPct,
        currency: quote.currency,
        marketTime: quote.marketTime,
        source: quote.source,
      };
    })
  );

  return results
    .filter(result => result.status === 'fulfilled' && result.value)
    .map(result => result.value);
}

module.exports = { fetchMarketSnapshot };
