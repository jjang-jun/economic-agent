const { loadTradeExecutionsWithStatus } = require('./trade-log');
const { fetchCurrentPrice } = require('../sources/price-provider');

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

function instrumentKey(trade = {}) {
  return String(trade.symbol || trade.ticker || '').toUpperCase().replace(/\.(KS|KQ)$/, '');
}

function tradeCashAmountKrw(trade) {
  if (typeof trade.cashAmountKrw === 'number') return trade.cashAmountKrw;
  const amount = Number(trade.amount || (Number(trade.quantity) * Number(trade.price)));
  const fxRate = typeof trade.fxRate === 'number' ? trade.fxRate : 1;
  return amount * fxRate;
}

function buildTradeLedger(trades = []) {
  const states = new Map();
  const realizedSales = [];
  const ordered = [...trades].sort((a, b) => new Date(a.executedAt || a.date) - new Date(b.executedAt || b.date));
  for (const trade of ordered) {
    const key = instrumentKey(trade);
    if (!key) continue;
    const quantity = Number(trade.quantity);
    if (!(quantity > 0)) continue;
    const state = states.get(key) || {
      key,
      ticker: trade.ticker || '',
      symbol: trade.symbol || trade.ticker || '',
      name: trade.name || '',
      currency: trade.currency || '',
      fxRate: trade.fxRate || null,
      quantity: 0,
      costBasisKrw: 0,
      recommendationIds: new Set(),
    };
    state.name = trade.name || state.name;
    state.fxRate = trade.fxRate || state.fxRate;
    state.currency = trade.currency || state.currency;
    if (trade.recommendationId) state.recommendationIds.add(trade.recommendationId);
    if (trade.side === 'buy') {
      state.quantity += quantity;
      state.costBasisKrw += tradeCashAmountKrw(trade);
    } else if (trade.side === 'sell') {
      const averageCostKrw = state.quantity > 0 ? state.costBasisKrw / state.quantity : 0;
      const matchedQuantity = Math.min(quantity, state.quantity);
      const allocatedCostKrw = averageCostKrw * matchedQuantity;
      const proceedsKrw = tradeCashAmountKrw(trade);
      const realizedPnlKrw = typeof trade.realizedPnlKrw === 'number'
        ? trade.realizedPnlKrw
        : (matchedQuantity === quantity && allocatedCostKrw > 0 ? proceedsKrw - allocatedCostKrw : null);
      realizedSales.push({
        trade,
        matchedQuantity,
        proceedsKrw: round(proceedsKrw),
        costBasisKrw: round(allocatedCostKrw),
        realizedPnlKrw: realizedPnlKrw === null ? null : round(realizedPnlKrw),
        realizedReturnPct: realizedPnlKrw !== null && allocatedCostKrw
          ? round((realizedPnlKrw / allocatedCostKrw) * 100)
          : null,
      });
      state.quantity = Math.max(0, state.quantity - matchedQuantity);
      state.costBasisKrw = Math.max(0, state.costBasisKrw - allocatedCostKrw);
    }
    states.set(key, state);
  }
  return {
    openPositions: [...states.values()].filter(state => state.quantity > 1e-9),
    realizedSales,
  };
}

async function buildTradePerformanceReport() {
  const tradeStatus = await loadTradeExecutionsWithStatus();
  if (tradeStatus.dataAvailable === false) {
    return {
      generatedAt: new Date().toISOString(),
      dataAvailable: false,
      dataSource: tradeStatus.source,
      dataError: tradeStatus.error,
      totalTrades: 0,
      positions: [],
    };
  }
  const trades = tradeStatus.trades;
  const ledger = buildTradeLedger(trades);
  const symbols = [...new Set(ledger.openPositions.map(position => position.symbol).filter(Boolean))];
  const needsUsdKrw = ledger.openPositions.some(position => position.currency === 'USD');
  const [quoteEntries, usdKrw] = await Promise.all([
    Promise.all(symbols.map(async symbol => [symbol, await fetchCurrentPrice(symbol)])),
    needsUsdKrw ? fetchCurrentPrice('KRW=X') : null,
  ]);
  const quotes = new Map(quoteEntries);
  const positions = ledger.openPositions.map(position => {
    const quote = quotes.get(position.symbol);
    const fxRate = position.currency === 'KRW' ? 1 : (usdKrw?.price || position.fxRate);
    const marketValue = typeof quote?.price === 'number' && typeof fxRate === 'number'
      ? quote.price * position.quantity * fxRate
      : null;
    const pnl = marketValue === null ? null : marketValue - position.costBasisKrw;
    return {
      ...position,
      recommendationIds: [...position.recommendationIds],
      quote,
      entryAmount: position.costBasisKrw,
      marketValue,
      pnl,
      returnPct: pnl === null || !position.costBasisKrw ? null : round((pnl / position.costBasisKrw) * 100),
    };
  });
  const evaluatedBuys = positions.filter(item => typeof item.pnl === 'number');
  const totalEntryAmount = evaluatedBuys.reduce((sum, item) => sum + item.entryAmount, 0);
  const totalMarketValue = evaluatedBuys.reduce((sum, item) => sum + (item.marketValue || 0), 0);
  const totalPnl = evaluatedBuys.reduce((sum, item) => sum + item.pnl, 0);
  const knownRealized = ledger.realizedSales.filter(item => typeof item.realizedPnlKrw === 'number');
  const realizedPnl = knownRealized.reduce((sum, item) => sum + item.realizedPnlKrw, 0);

  return {
    generatedAt: new Date().toISOString(),
    dataAvailable: true,
    dataSource: tradeStatus.source,
    totalTrades: trades.length,
    buyTrades: trades.filter(trade => trade.side === 'buy').length,
    sellTrades: trades.filter(trade => trade.side === 'sell').length,
    linkedRecommendations: trades.filter(trade => trade.recommendationId).length,
    evaluatedBuys: evaluatedBuys.length,
    totalEntryAmount,
    totalMarketValue,
    totalPnl,
    totalReturnPct: totalEntryAmount ? round((totalPnl / totalEntryAmount) * 100) : null,
    realizedSales: ledger.realizedSales,
    realizedPnl: knownRealized.length ? round(realizedPnl) : null,
    realizedPnlKnown: knownRealized.length,
    sellsWithReason: ledger.realizedSales.filter(item => item.trade.sellReason).length,
    positions,
  };
}

module.exports = {
  buildTradePerformanceReport,
  formatTradePosition,
  buildTradeLedger,
};
