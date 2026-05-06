const { loadTradeExecutions } = require('./trade-log');
const { fetchQuote } = require('../sources/yahoo-finance');

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatTradePosition(trade, quote) {
  const quantity = Number(trade.quantity);
  const entryPrice = Number(trade.price);
  const currentPrice = quote?.price ?? null;
  const entryAmount = Number(trade.amount || quantity * entryPrice);
  const marketValue = currentPrice && Number.isFinite(quantity) ? currentPrice * quantity : null;
  const pnl = trade.side === 'buy' && marketValue !== null
    ? marketValue - entryAmount
    : null;
  const returnPct = pnl !== null && entryAmount
    ? round((pnl / entryAmount) * 100)
    : null;

  return { trade, quote, entryAmount, marketValue, pnl, returnPct };
}

async function buildTradePerformanceReport() {
  const trades = await loadTradeExecutions();
  const symbols = [...new Set(trades.map(trade => trade.symbol).filter(Boolean))];
  const quoteEntries = await Promise.all(symbols.map(async symbol => [symbol, await fetchQuote(symbol)]));
  const quotes = new Map(quoteEntries);
  const positions = trades.map(trade => formatTradePosition(trade, quotes.get(trade.symbol)));
  const openBuys = positions.filter(item => item.trade.side === 'buy');
  const evaluatedBuys = openBuys.filter(item => typeof item.pnl === 'number');
  const totalEntryAmount = evaluatedBuys.reduce((sum, item) => sum + item.entryAmount, 0);
  const totalMarketValue = evaluatedBuys.reduce((sum, item) => sum + (item.marketValue || 0), 0);
  const totalPnl = evaluatedBuys.reduce((sum, item) => sum + item.pnl, 0);

  return {
    generatedAt: new Date().toISOString(),
    totalTrades: trades.length,
    buyTrades: trades.filter(trade => trade.side === 'buy').length,
    sellTrades: trades.filter(trade => trade.side === 'sell').length,
    linkedRecommendations: trades.filter(trade => trade.recommendationId).length,
    evaluatedBuys: evaluatedBuys.length,
    totalEntryAmount,
    totalMarketValue,
    totalPnl,
    totalReturnPct: totalEntryAmount ? round((totalPnl / totalEntryAmount) * 100) : null,
    positions,
  };
}

module.exports = {
  buildTradePerformanceReport,
  formatTradePosition,
};
