const fs = require('fs');
const path = require('path');
const { getKSTDate } = require('./article-archive');
const {
  loadPersistedPortfolioCashFlows,
  persistPortfolioCashFlows,
} = require('./persistence');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'portfolio-cash-flows');
const LOG_FILE = path.join(DATA_DIR, 'portfolio-cash-flows.json');
const FLOW_TYPES = new Set(['deposit', 'withdrawal', 'dividend', 'interest', 'fee', 'tax', 'adjustment']);

function loadLocalPortfolioCashFlows() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function savePortfolioCashFlows(flows) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, JSON.stringify(flows, null, 2));
}

function normalizeFlowType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!FLOW_TYPES.has(type)) {
    throw new Error(`type must be one of: ${[...FLOW_TYPES].join(', ')}`);
  }
  return type;
}

function signedPortfolioImpact(type, amount) {
  if (['withdrawal', 'fee', 'tax'].includes(type)) return -amount;
  return amount;
}

function buildPortfolioCashFlow(input = {}) {
  const type = normalizeFlowType(input.type);
  const rawAmount = Number(input.amount);
  if (!Number.isFinite(rawAmount) || rawAmount === 0) throw new Error('amount must be a non-zero number');
  const magnitude = Math.abs(rawAmount);
  const amount = type === 'adjustment' ? rawAmount : signedPortfolioImpact(type, magnitude);
  const external = input.external === undefined
    ? ['deposit', 'withdrawal'].includes(type)
    : input.external === true;
  const occurredAt = input.occurredAt || new Date().toISOString();
  const date = input.date || getKSTDate(new Date(occurredAt));
  const accountId = input.accountId || 'default:main';

  return {
    id: input.id || `${date}:${type}:${Date.parse(occurredAt)}:${Math.abs(amount)}`,
    date,
    occurredAt,
    accountId,
    type,
    amount,
    externalAmount: external ? amount : 0,
    external,
    currency: input.currency || 'KRW',
    notes: input.notes || '',
  };
}

async function loadPortfolioCashFlowsWithStatus() {
  const local = loadLocalPortfolioCashFlows();
  const persisted = await loadPersistedPortfolioCashFlows();
  if (persisted.error || persisted.disabled || !persisted.rows) {
    return {
      flows: local,
      dataAvailable: local.length > 0,
      source: local.length > 0 ? 'local_fallback' : 'unavailable',
      persistenceAvailable: false,
      error: persisted.error?.message || (persisted.disabled ? 'persistence disabled' : 'persistence unavailable'),
    };
  }
  const byId = new Map(local.filter(item => item.id).map(item => [item.id, item]));
  for (const flow of persisted.rows) {
    if (flow?.id) byId.set(flow.id, flow);
  }
  const flows = [...byId.values()].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  savePortfolioCashFlows(flows);
  return { flows, dataAvailable: true, source: 'supabase', persistenceAvailable: true, error: '' };
}

async function loadPortfolioCashFlows() {
  return (await loadPortfolioCashFlowsWithStatus()).flows;
}

async function recordPortfolioCashFlow(input) {
  const flow = buildPortfolioCashFlow(input);
  const existing = await loadPortfolioCashFlows();
  const byId = new Map(existing.filter(item => item.id).map(item => [item.id, item]));
  byId.set(flow.id, flow);
  const flows = [...byId.values()].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  savePortfolioCashFlows(flows);
  const result = await persistPortfolioCashFlows(flows);
  if (result.error) throw new Error(`현금흐름 저장 실패: ${result.error.message}`);
  return flow;
}

module.exports = {
  FLOW_TYPES,
  LOG_FILE,
  buildPortfolioCashFlow,
  loadLocalPortfolioCashFlows,
  loadPortfolioCashFlows,
  loadPortfolioCashFlowsWithStatus,
  savePortfolioCashFlows,
  recordPortfolioCashFlow,
};
