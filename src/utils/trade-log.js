const fs = require('fs');
const path = require('path');
const { getKSTDate } = require('./article-archive');
const { normalizeYahooSymbol } = require('../sources/yahoo-finance');
const { persistTradeExecutions, loadPersistedTradeExecutions } = require('./persistence');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'trades');
const LOG_FILE = path.join(DATA_DIR, 'trade-executions.json');

function loadLocalTradeExecutions() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveTradeExecutions(trades) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, JSON.stringify(trades, null, 2));
}

async function loadTradeExecutions() {
  const local = loadLocalTradeExecutions();
  const persisted = await loadPersistedTradeExecutions();
  if (persisted.error || persisted.disabled || !persisted.rows) {
    return local;
  }

  const byId = new Map(local.filter(trade => trade.id).map(trade => [trade.id, trade]));
  for (const trade of persisted.rows) {
    if (trade?.id) byId.set(trade.id, trade);
  }
  const merged = [...byId.values()].sort((a, b) => new Date(a.executedAt) - new Date(b.executedAt));
  saveTradeExecutions(merged);
  return merged;
}

function normalizeSide(side) {
  const value = String(side || '').toLowerCase();
  if (['buy', 'sell'].includes(value)) return value;
  throw new Error('side must be buy or sell');
}

function buildTradeExecution(input) {
  const side = normalizeSide(input.side);
  const date = input.date || getKSTDate();
  const executedAt = input.executedAt || new Date().toISOString();
  const ticker = input.ticker || '';
  const symbol = input.symbol || normalizeYahooSymbol(ticker);
  const quantity = Number(input.quantity);
  const price = Number(input.price);
  const fees = input.fees === undefined ? 0 : Number(input.fees);
  const taxes = input.taxes === undefined ? 0 : Number(input.taxes);

  if (!ticker && !symbol) throw new Error('ticker or symbol is required');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('quantity must be a positive number');
  if (!Number.isFinite(price) || price <= 0) throw new Error('price must be a positive number');

  const grossAmount = quantity * price;
  const signedAmount = side === 'buy'
    ? grossAmount + (Number.isFinite(fees) ? fees : 0) + (Number.isFinite(taxes) ? taxes : 0)
    : grossAmount - (Number.isFinite(fees) ? fees : 0) - (Number.isFinite(taxes) ? taxes : 0);

  return {
    id: input.id || `${date}:${side}:${ticker || symbol}:${Date.parse(executedAt)}`,
    date,
    executedAt,
    side,
    ticker,
    symbol,
    name: input.name || '',
    quantity,
    price,
    amount: signedAmount,
    fees: Number.isFinite(fees) ? fees : 0,
    taxes: Number.isFinite(taxes) ? taxes : 0,
    recommendationId: input.recommendationId || '',
    notes: input.notes || '',
  };
}

async function recordTradeExecution(input) {
  const trade = buildTradeExecution(input);
  const existing = loadLocalTradeExecutions();
  const byId = new Map(existing.filter(item => item.id).map(item => [item.id, item]));
  byId.set(trade.id, trade);
  const trades = [...byId.values()].sort((a, b) => new Date(a.executedAt) - new Date(b.executedAt));
  saveTradeExecutions(trades);
  await persistTradeExecutions(trades);
  return trade;
}

module.exports = {
  LOG_FILE,
  loadLocalTradeExecutions,
  loadTradeExecutions,
  saveTradeExecutions,
  buildTradeExecution,
  recordTradeExecution,
};
