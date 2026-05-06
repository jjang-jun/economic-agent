const WATCHLIST = require('../config/watchlist');
const { fetchQuote } = require('../sources/yahoo-finance');

function getSymbolsForSession(session) {
  const primary = WATCHLIST[session] || [];
  return [...primary, ...WATCHLIST.global];
}

async function fetchMarketSnapshot(session) {
  const items = getSymbolsForSession(session);
  if (items.length === 0) return [];

  const results = await Promise.allSettled(
    items.map(async item => {
      const quote = await fetchQuote(item.symbol);
      if (!quote) return null;
      return {
        name: item.name,
        symbol: quote.symbol,
        price: quote.price,
        previousClose: quote.previousClose,
        changePercent: quote.changePercent,
        currency: quote.currency,
        marketTime: quote.marketTime,
      };
    })
  );

  return results
    .filter(result => result.status === 'fulfilled' && result.value)
    .map(result => result.value);
}

module.exports = { fetchMarketSnapshot };
