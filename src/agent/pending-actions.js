const crypto = require('crypto');
const {
  loadPortfolio,
  normalizePortfolio,
  savePortfolioFile,
  applyTradeToPortfolio,
} = require('../utils/portfolio');
const { recordTradeExecution, buildTradeExecution } = require('../utils/trade-log');
const { persistPendingAction, loadPendingAction } = require('../utils/persistence');
const {
  loadStoredPortfolio,
  updateStoredCash,
  applyTradeToStoredPortfolio,
} = require('../utils/portfolio-store');
const { formatKRW } = require('../utils/decision-engine');
const { escapeHtml } = require('./response-composer');

function parseNumber(value) {
  const num = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

function getActionCommandParts(text = '') {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function expiresAt(minutes = 30) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function buildToken() {
  return crypto.randomBytes(8).toString('hex');
}

function formatAmount(value) {
  return typeof value === 'number' ? formatKRW(value) : 'n/a';
}

function buildTradeDraft({ side, parts }) {
  const ticker = parts[1] || '';
  const quantity = parseNumber(parts[2]);
  const price = parseNumber(parts[3]);
  const name = parts.slice(4).join(' ');
  if (!ticker || !quantity || !price) {
    throw new Error(`/${side} 형식: /${side} TICKER 수량 가격 [이름]`);
  }
  const trade = buildTradeExecution({
    side,
    ticker,
    quantity,
    price,
    name,
    notes: 'telegram-agent',
  });
  return {
    type: side,
    requestedPayload: trade,
    preview: [
      `<b>${side === 'buy' ? '매수' : '매도'} 기록 초안</b>`,
      `종목: ${escapeHtml(name || ticker)}`,
      `수량: ${quantity}`,
      `단가: ${Number(price).toLocaleString('ko-KR')}`,
      `금액: ${formatAmount(trade.amount)}`,
    ].join('\n'),
  };
}

function buildCashDraft(parts) {
  const cashAmount = parseNumber(parts[1]);
  if (cashAmount === null || cashAmount < 0) {
    throw new Error('/cash 형식: /cash 현금잔액');
  }
  const portfolio = normalizePortfolio(loadPortfolio());
  return {
    type: 'cash',
    requestedPayload: {
      cashAmount,
      previousCashAmount: portfolio.cashAmount,
    },
    preview: [
      '<b>현금 잔액 변경 초안</b>',
      `기존 현금: ${formatAmount(portfolio.cashAmount)}`,
      `변경 현금: ${formatAmount(cashAmount)}`,
    ].join('\n'),
  };
}

async function buildCashDraftAsync(parts) {
  const cashAmount = parseNumber(parts[1]);
  if (cashAmount === null || cashAmount < 0) {
    throw new Error('/cash 형식: /cash 현금잔액');
  }
  const stored = await loadStoredPortfolio();
  const portfolio = stored || normalizePortfolio(loadPortfolio());
  return {
    type: 'cash',
    requestedPayload: {
      cashAmount,
      previousCashAmount: portfolio.cashAmount,
    },
    preview: [
      '<b>현금 잔액 변경 초안</b>',
      `기존 현금: ${formatAmount(portfolio.cashAmount)}`,
      `변경 현금: ${formatAmount(cashAmount)}`,
    ].join('\n'),
  };
}

async function createPendingAction({ chatId, text }) {
  const parts = getActionCommandParts(text);
  const command = (parts[0] || '').replace(/@[\w_]+$/, '').toLowerCase();
  let draft;
  if (command === '/buy') draft = buildTradeDraft({ side: 'buy', parts });
  else if (command === '/sell') draft = buildTradeDraft({ side: 'sell', parts });
  else if (command === '/cash') draft = await buildCashDraftAsync(parts);
  else throw new Error('unsupported pending action');

  const token = buildToken();
  const action = {
    id: crypto.randomUUID(),
    chatId: String(chatId || ''),
    type: draft.type,
    status: 'pending',
    requestedPayload: draft.requestedPayload,
    riskReview: {
      note: '승인 전 초안입니다. 실제 주문이 아니라 Supabase 포트폴리오/거래 기록만 반영합니다.',
    },
    confirmationToken: token,
    expiresAt: expiresAt(),
    payload: { text },
  };
  await persistPendingAction(action);

  return {
    action,
    response: [
      draft.preview,
      '',
      '이 작업을 기록할까요?',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [[
        { text: '기록하기', callback_data: `confirm:${action.id}:${token}` },
        { text: '취소', callback_data: `cancel:${action.id}:${token}` },
      ]],
    },
  };
}

function ensureActionUsable(row, token) {
  if (!row) throw new Error('pending action not found');
  if (row.status !== 'pending') throw new Error(`already ${row.status}`);
  if (row.confirmation_token !== token) throw new Error('invalid token');
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) throw new Error('expired action');
}

async function confirmPendingAction(actionId, token) {
  const row = await loadPendingAction(actionId);
  ensureActionUsable(row, token);
  const payload = row.requested_payload || {};

  if (row.type === 'buy' || row.type === 'sell') {
    const trade = await recordTradeExecution({
      ...payload,
      updatePortfolio: false,
    });
    const updatedStored = await applyTradeToStoredPortfolio(trade);
    if (!updatedStored) {
      savePortfolioFile(applyTradeToPortfolio(normalizePortfolio(loadPortfolio()), trade));
    }
    await persistPendingAction({
      id: row.id,
      chatId: row.chat_id,
      type: row.type,
      status: 'confirmed',
      requestedPayload: payload,
      riskReview: row.risk_review,
      confirmationToken: row.confirmation_token,
      expiresAt: row.expires_at,
      confirmedAt: new Date().toISOString(),
      payload: { ...row.payload, tradeId: trade.id },
    });
    return `기록 완료: ${escapeHtml(trade.side)} ${escapeHtml(trade.name || trade.ticker || trade.symbol)} ${trade.quantity}주 @ ${trade.price.toLocaleString('ko-KR')}`;
  }

  if (row.type === 'cash') {
    const updatedStored = await updateStoredCash(payload.cashAmount);
    if (!updatedStored) {
      const portfolio = normalizePortfolio(loadPortfolio());
      portfolio.cashAmount = payload.cashAmount;
      savePortfolioFile(portfolio);
    }
    await persistPendingAction({
      id: row.id,
      chatId: row.chat_id,
      type: row.type,
      status: 'confirmed',
      requestedPayload: payload,
      riskReview: row.risk_review,
      confirmationToken: row.confirmation_token,
      expiresAt: row.expires_at,
      confirmedAt: new Date().toISOString(),
      payload: row.payload,
    });
    return `현금 잔액 변경 완료: ${formatAmount(payload.cashAmount)}`;
  }

  throw new Error('unsupported action type');
}

async function cancelPendingAction(actionId, token) {
  const row = await loadPendingAction(actionId);
  ensureActionUsable(row, token);
  await persistPendingAction({
    id: row.id,
    chatId: row.chat_id,
    type: row.type,
    status: 'cancelled',
    requestedPayload: row.requested_payload,
    riskReview: row.risk_review,
    confirmationToken: row.confirmation_token,
    expiresAt: row.expires_at,
    cancelledAt: new Date().toISOString(),
    payload: row.payload,
  });
  return '취소했습니다.';
}

async function handlePendingActionCallback(data = '') {
  const [verb, actionId, token] = String(data || '').split(':');
  if (!['confirm', 'cancel'].includes(verb) || !actionId || !token) {
    throw new Error('invalid callback data');
  }
  const response = verb === 'confirm'
    ? await confirmPendingAction(actionId, token)
    : await cancelPendingAction(actionId, token);
  return { verb, actionId, response };
}

module.exports = {
  createPendingAction,
  handlePendingActionCallback,
  confirmPendingAction,
  cancelPendingAction,
};
