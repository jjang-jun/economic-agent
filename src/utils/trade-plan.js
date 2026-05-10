const fs = require('fs');
const path = require('path');
const { getKSTDate } = require('./article-archive');
const { normalizeYahooSymbol } = require('../sources/yahoo-finance');
const { loadPortfolio, savePortfolioFile } = require('./portfolio');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'trades');
const PLAN_FILE = path.join(DATA_DIR, 'trade-plans.json');

function loadTradePlans() {
  try {
    const rows = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf-8'));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function saveTradePlans(plans) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plans, null, 2));
}

function loadPortfolioTradePlans() {
  try {
    const portfolio = loadPortfolio();
    return Array.isArray(portfolio.plannedTrades) ? portfolio.plannedTrades : [];
  } catch {
    return [];
  }
}

function mergeTradePlans(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const plan of group || []) {
      if (!plan?.id) continue;
      byId.set(plan.id, plan);
    }
  }
  return [...byId.values()].sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));
}

function syncOpenPlansToPortfolio(plans) {
  try {
    const portfolio = loadPortfolio();
    const openPlans = (plans || []).filter(plan => (plan.status || 'open') === 'open');
    savePortfolioFile({
      ...portfolio,
      plannedTrades: openPlans,
    });
  } catch (err) {
    console.warn(`[매매계획] 포트폴리오 계획 동기화 실패: ${err.message}`);
  }
}

function addKstDays(date, days) {
  const base = new Date(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(base.getTime())) return date;
  base.setUTCDate(base.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

function normalizeSide(side) {
  const value = String(side || '').toLowerCase();
  if (['buy', 'sell'].includes(value)) return value;
  throw new Error('side must be buy or sell');
}

function buildTradePlan(input = {}) {
  const side = normalizeSide(input.side);
  const plannedDate = input.plannedDate || input.date || getKSTDate();
  const ticker = String(input.ticker || '').trim();
  const symbol = String(input.symbol || normalizeYahooSymbol(ticker)).trim();
  const quantity = Number(input.quantity);
  const targetRemainingQuantity = input.targetRemainingQuantity === undefined
    ? null
    : Number(input.targetRemainingQuantity);

  if (!ticker && !symbol) throw new Error('ticker or symbol is required');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('quantity must be a positive number');
  if (targetRemainingQuantity !== null && (!Number.isFinite(targetRemainingQuantity) || targetRemainingQuantity < 0)) {
    throw new Error('targetRemainingQuantity must be zero or a positive number');
  }

  const createdAt = input.createdAt || new Date().toISOString();
  return {
    id: input.id || `${plannedDate}:${side}:${ticker || symbol}:${quantity}`,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    plannedDate,
    side,
    ticker,
    symbol,
    name: input.name || '',
    quantity,
    targetRemainingQuantity,
    status: input.status || 'open',
    notes: input.notes || '',
    executedTradeId: input.executedTradeId || '',
    executedAt: input.executedAt || '',
  };
}

function upsertTradePlan(input) {
  const plan = buildTradePlan(input);
  const existing = loadTradePlans();
  const byId = new Map(existing.filter(item => item.id).map(item => [item.id, item]));
  byId.set(plan.id, plan);
  const plans = [...byId.values()].sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));
  saveTradePlans(plans);
  syncOpenPlansToPortfolio(plans);
  return plan;
}

function loadOpenTradePlans(options = {}) {
  const today = options.today || getKSTDate();
  const throughDate = typeof options.upcomingDays === 'number' && options.upcomingDays > 0
    ? addKstDays(today, options.upcomingDays)
    : today;
  const plans = options.includePortfolio === false
    ? loadTradePlans()
    : mergeTradePlans(loadPortfolioTradePlans(), loadTradePlans());
  return plans
    .filter(plan => (plan.status || 'open') === 'open')
    .filter(plan => options.includeFuture || !plan.plannedDate || String(plan.plannedDate) <= String(throughDate))
    .sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));
}

function sameTickerOrSymbol(plan, trade) {
  return Boolean(
    (plan.ticker && trade.ticker && plan.ticker === trade.ticker)
    || (plan.symbol && trade.symbol && plan.symbol === trade.symbol)
  );
}

function markMatchingTradePlanExecuted(trade) {
  if (!trade?.side) return null;
  const plans = loadTradePlans();
  const index = plans.findIndex(plan => (
    (plan.status || 'open') === 'open'
    && plan.side === trade.side
    && sameTickerOrSymbol(plan, trade)
    && Number(plan.quantity) === Number(trade.quantity)
  ));
  if (index < 0) return null;

  const updated = {
    ...plans[index],
    status: 'executed',
    updatedAt: new Date().toISOString(),
    executedTradeId: trade.id || '',
    executedAt: trade.executedAt || new Date().toISOString(),
  };
  plans[index] = updated;
  saveTradePlans(plans);
  syncOpenPlansToPortfolio(plans);
  return updated;
}

module.exports = {
  PLAN_FILE,
  loadTradePlans,
  saveTradePlans,
  loadPortfolioTradePlans,
  buildTradePlan,
  upsertTradePlan,
  loadOpenTradePlans,
  markMatchingTradePlanExecuted,
};
