const crypto = require('crypto');
const {
  loadPortfolio,
  normalizePortfolio,
  savePortfolioFile,
  applyTradeToPortfolio,
} = require('../utils/portfolio');
const { recordTradeExecution, buildTradeExecution } = require('../utils/trade-log');
const { loadRecommendations } = require('../utils/recommendation-log');
const { isBuyCandidateRecommendation } = require('./recommendations-view');
const { loadTradePlans } = require('../utils/trade-plan');
const { fetchCurrentPrice, isDomesticTicker } = require('../sources/price-provider');
const {
  isPersistenceEnabled,
  persistPendingAction,
  loadPendingAction,
  loadPendingActionsForChat,
} = require('../utils/persistence');
const {
  loadStoredPortfolio,
  saveStoredPortfolio,
  updateStoredCash,
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

function parseTradeMetadata(tokens = []) {
  const nameTokens = [];
  let recommendationId = '';
  const metadata = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = String(token || '').toLowerCase();
    if (['--rec', '--recommendation', '--recommendationid'].includes(lower)) {
      recommendationId = tokens[i + 1] || '';
      i++;
      continue;
    }
    const match = String(token || '').match(/^(?:--)?(?:rec|recommendation|recommendationId)=(.+)$/i);
    if (match) {
      recommendationId = match[1];
      continue;
    }
    const option = String(token || '').match(/^(?:--)?(reason|notes|fees|fee|taxes|tax|fx|currency)=(.+)$/i);
    if (option) {
      const keyMap = { fee: 'fees', tax: 'taxes', fx: 'fxRate' };
      const key = keyMap[option[1].toLowerCase()] || option[1].toLowerCase();
      metadata[key] = option[2].replace(/_/g, ' ');
      continue;
    }
    nameTokens.push(token);
  }

  return {
    name: nameTokens.join(' '),
    recommendationId,
    sellReason: metadata.reason || '',
    notes: metadata.notes || '',
    fees: metadata.fees,
    taxes: metadata.taxes,
    fxRate: metadata.fxRate,
    currency: metadata.currency || '',
  };
}

function normalizedInstrument(value = '') {
  return String(value || '').toUpperCase().replace(/\.(KS|KQ)$/, '');
}

function matchesInstrument(left = {}, right = {}) {
  const leftKeys = [left.ticker, left.symbol].map(normalizedInstrument).filter(Boolean);
  const rightKeys = new Set([right.ticker, right.symbol].map(normalizedInstrument).filter(Boolean));
  return leftKeys.some(key => rightKeys.has(key));
}

function recommendationTime(item = {}) {
  return new Date(item.createdAt || `${item.date || ''}T00:00:00+09:00`).getTime();
}

function findRecommendationForTrade(trade, recommendations = [], options = {}) {
  if (trade.recommendationId) {
    const explicit = recommendations.find(item => item.id === trade.recommendationId);
    if (!explicit) throw new Error(`추천 ID를 찾을 수 없습니다: ${trade.recommendationId}`);
    if (!matchesInstrument(trade, explicit)) throw new Error('추천 ID의 종목과 거래 종목이 일치하지 않습니다.');
    return { recommendation: explicit, source: 'explicit' };
  }
  if (trade.side !== 'buy') return { recommendation: null, source: '' };
  const cutoff = (options.now || Date.now()) - (options.maxAgeDays || 30) * 24 * 60 * 60 * 1000;
  const matches = recommendations
    .filter(item => matchesInstrument(trade, item))
    .filter(isBuyCandidateRecommendation)
    .filter(item => recommendationTime(item) >= cutoff)
    .sort((a, b) => recommendationTime(b) - recommendationTime(a));
  return { recommendation: matches[0] || null, source: matches[0] ? 'auto_ticker_match' : '' };
}

function findTradePlan(trade, plans = []) {
  return plans.find(plan => (
    (plan.status || 'open') === 'open'
    && plan.side === trade.side
    && Number(plan.quantity) === Number(trade.quantity)
    && matchesInstrument(trade, plan)
  )) || null;
}

function positionForTrade(portfolio = {}, trade = {}) {
  return (portfolio.positions || []).find(position => matchesInstrument(trade, position)) || null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function describePendingAction(row = {}) {
  const payload = row.requested_payload || {};
  if (row.type === 'cash') {
    return `▸ ${row.id} · 현금 ${formatAmount(payload.cashAmount)} · 만료 ${row.expires_at || 'n/a'}`;
  }
  const amount = typeof payload.cashAmountKrw === 'number'
    ? formatAmount(payload.cashAmountKrw)
    : typeof payload.amount === 'number'
      ? formatAmount(payload.amount)
    : formatAmount((payload.quantity || 0) * (payload.price || 0));
  return `▸ ${row.id} · ${row.type} ${escapeHtml(payload.name || payload.ticker || payload.symbol || '')} ${payload.quantity || '?'}주 @ ${Number(payload.price || 0).toLocaleString('ko-KR')} · ${amount}`;
}

async function formatPendingActions(chatId) {
  const rows = await loadPendingActionsForChat(chatId, { status: 'pending', limit: 5 });
  return [
    '<b>대기 중인 승인 작업</b>',
    rows.length > 0
      ? rows.map(describePendingAction).join('\n')
      : '대기 중인 작업이 없습니다.',
  ].join('\n');
}

function buildTradeDraft({ side, parts, source = 'discord-agent' }) {
  const ticker = parts[1] || '';
  const quantity = parseNumber(parts[2]);
  const price = parseNumber(parts[3]);
  const metadata = parseTradeMetadata(parts.slice(4));
  if (!ticker || !quantity || !price) {
    throw new Error(`/${side} 형식: /${side} TICKER 수량 가격 [이름] [rec=추천ID]`);
  }
  const trade = buildTradeExecution({
    side,
    ticker,
    quantity,
    price,
    name: metadata.name,
    recommendationId: metadata.recommendationId,
    sellReason: metadata.sellReason,
    fees: metadata.fees,
    taxes: metadata.taxes,
    fxRate: metadata.fxRate,
    currency: metadata.currency,
    notes: metadata.notes ? `${source} · ${metadata.notes}` : source,
  });
  return {
    type: side,
    requestedPayload: trade,
  };
}

async function enrichTradeDraft(draft) {
  const baseTrade = draft.requestedPayload;
  const [storedPortfolio, recommendations] = await Promise.all([
    loadStoredPortfolio(),
    loadRecommendations(),
  ]);
  const portfolio = storedPortfolio || normalizePortfolio(loadPortfolio());
  const position = positionForTrade(portfolio, baseTrade);
  const recMatch = findRecommendationForTrade(baseTrade, recommendations);
  const plans = [
    ...(portfolio.plannedTrades || []),
    ...loadTradePlans(),
  ];
  const plan = findTradePlan(baseTrade, plans);
  const currency = String(baseTrade.currency || position?.currency || (isDomesticTicker(baseTrade.ticker || baseTrade.symbol) ? 'KRW' : 'USD')).toUpperCase();
  let fxRate = baseTrade.fxRate || position?.fxRate || (currency === 'USD' ? portfolio.fxRates?.USDKRW : 1);
  if (currency === 'USD' && !(typeof fxRate === 'number' && fxRate > 1)) {
    const fxQuote = await fetchCurrentPrice('KRW=X');
    fxRate = fxQuote?.price;
  }
  if (!(typeof fxRate === 'number' && fxRate > 0)) {
    throw new Error(`${currency} 거래 환율을 확인할 수 없습니다. fx=원화환율을 함께 입력해주세요.`);
  }
  const fees = Number(baseTrade.fees || 0);
  const taxes = Number(baseTrade.taxes || 0);
  const costBasisKrw = baseTrade.side === 'sell' && position?.avgPrice
    ? position.avgPrice * baseTrade.quantity * fxRate
    : null;
  const realizedPnlKrw = costBasisKrw !== null
    ? ((baseTrade.price * baseTrade.quantity) - fees - taxes) * fxRate - costBasisKrw
    : null;
  const trade = buildTradeExecution({
    ...baseTrade,
    name: baseTrade.name || position?.name || recMatch.recommendation?.name || '',
    recommendationId: recMatch.recommendation?.id || '',
    recommendationLinkSource: recMatch.source,
    tradePlanId: plan?.id || '',
    currency,
    fxRate,
    costBasisKrw,
    realizedPnlKrw: realizedPnlKrw === null ? null : round(realizedPnlKrw),
    realizedReturnPct: realizedPnlKrw === null || !costBasisKrw
      ? null
      : round((realizedPnlKrw / costBasisKrw) * 100),
  });
  if (trade.side === 'buy' && typeof portfolio.cashAmount === 'number' && trade.cashAmountKrw > portfolio.cashAmount) {
    throw new Error(`현금 부족: 필요 ${formatAmount(trade.cashAmountKrw)}, 보유 ${formatAmount(portfolio.cashAmount)}`);
  }
  applyTradeToPortfolio(portfolio, trade);
  const unit = trade.currency === 'KRW' ? '원' : ` ${trade.currency}`;
  const preview = [
    `<b>${trade.side === 'buy' ? '매수' : '매도'} 기록 초안</b>`,
    `종목: ${escapeHtml(trade.name || trade.ticker || trade.symbol)}`,
    `수량: ${trade.quantity}`,
    `단가: ${Number(trade.price).toLocaleString('ko-KR')}${unit}`,
    `원화 반영액: ${formatAmount(trade.cashAmountKrw)}`,
    trade.recommendationId
      ? `추천 연결: ${escapeHtml(trade.recommendationId)}${trade.recommendationLinkSource === 'auto_ticker_match' ? ' (자동)' : ''}`
      : '추천 연결: 없음',
    trade.tradePlanId ? `매매계획 연결: ${escapeHtml(trade.tradePlanId)}` : '매매계획 연결: 없음',
    trade.side === 'sell'
      ? `예상 실현손익: ${trade.realizedPnlKrw === null ? '원가 데이터 부족' : `${formatAmount(trade.realizedPnlKrw)} (${trade.realizedReturnPct}%)`}`
      : null,
    trade.side === 'sell' ? `매도 사유: ${escapeHtml(trade.sellReason || '미입력')}` : null,
    typeof portfolio.cashAmount === 'number'
      ? `반영 후 예상 현금: ${formatAmount(portfolio.cashAmount + (trade.side === 'buy' ? -trade.cashAmountKrw : trade.cashAmountKrw))}`
      : null,
  ].filter(Boolean).join('\n');
  return { ...draft, requestedPayload: trade, preview };
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

async function createPendingAction({ chatId, text, source = 'discord-agent' }) {
  const parts = getActionCommandParts(text);
  const command = (parts[0] || '').replace(/@[\w_]+$/, '').toLowerCase();
  let draft;
  if (command === '/buy') draft = await enrichTradeDraft(buildTradeDraft({ side: 'buy', parts, source }));
  else if (command === '/sell') draft = await enrichTradeDraft(buildTradeDraft({ side: 'sell', parts, source }));
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
    payload: { text, source },
  };
  const persistResult = await persistPendingAction(action);
  if (persistResult.error || persistResult.saved < 1) {
    throw new Error(`pending action 저장 실패: ${persistResult.error?.message || 'Supabase persistence unavailable'}`);
  }

  return {
    action,
    response: [
      draft.preview,
      '',
      '이 작업을 기록할까요?',
    ].join('\n'),
  };
}

function ensureActionUsable(row, token, options = {}) {
  if (!row) throw new Error('pending action not found');
  if (row.status !== 'pending') throw new Error(`already ${row.status}`);
  if (row.confirmation_token !== token) throw new Error('invalid token');
  if (options.chatId && row.chat_id && String(row.chat_id) !== String(options.chatId)) {
    throw new Error('chat mismatch');
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) throw new Error('expired action');
}

async function confirmPendingAction(actionId, token, options = {}) {
  const row = await loadPendingAction(actionId);
  ensureActionUsable(row, token, options);
  const payload = row.requested_payload || {};

  if (row.type === 'buy' || row.type === 'sell') {
    const storedPortfolio = await loadStoredPortfolio();
    if (!storedPortfolio && isPersistenceEnabled()) {
      throw new Error('Supabase 포트폴리오 원본을 읽을 수 없어 거래 기록을 중단합니다.');
    }
    const currentPortfolio = storedPortfolio || normalizePortfolio(loadPortfolio());
    const updatedPortfolio = applyTradeToPortfolio(currentPortfolio, payload);
    const trade = await recordTradeExecution({
      ...payload,
      updatePortfolio: false,
    });
    if (storedPortfolio) {
      await saveStoredPortfolio(updatedPortfolio);
    } else {
      savePortfolioFile(updatedPortfolio);
    }
    const remainingPosition = positionForTrade(updatedPortfolio, trade);
    const actionResult = await persistPendingAction({
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
    if (actionResult.error || actionResult.saved < 1) throw new Error('거래 승인 상태 저장 실패');
    return [
      `기록 완료: ${escapeHtml(trade.side)} ${escapeHtml(trade.name || trade.ticker || trade.symbol)} ${trade.quantity}주 @ ${trade.price.toLocaleString('ko-KR')}`,
      trade.recommendationId ? `추천 연결: ${escapeHtml(trade.recommendationId)}` : '추천 연결: 없음',
      trade.tradePlanId ? `매매계획 완료: ${escapeHtml(trade.tradePlanId)}` : '',
      trade.side === 'sell' && typeof trade.realizedPnlKrw === 'number'
        ? `실현손익: ${formatAmount(trade.realizedPnlKrw)} (${trade.realizedReturnPct}%)`
        : '',
      trade.side === 'sell' ? `매도 사유: ${escapeHtml(trade.sellReason || '미입력')}` : '',
      `반영 후 현금: ${formatAmount(updatedPortfolio.cashAmount)}`,
      `반영 후 보유: ${remainingPosition ? `${remainingPosition.quantity}주` : '0주'}`,
      `기록 시각: ${new Date(trade.executedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}`,
    ].filter(Boolean).join('\n');
  }

  if (row.type === 'cash') {
    const updatedStored = await updateStoredCash(payload.cashAmount);
    if (!updatedStored) {
      const portfolio = normalizePortfolio(loadPortfolio());
      portfolio.cashAmount = payload.cashAmount;
      savePortfolioFile(portfolio);
    }
    const actionResult = await persistPendingAction({
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
    if (actionResult.error || actionResult.saved < 1) throw new Error('현금 승인 상태 저장 실패');
    return `현금 잔액 변경 완료: ${formatAmount(payload.cashAmount)}`;
  }

  throw new Error('unsupported action type');
}

async function cancelPendingAction(actionId, token, options = {}) {
  const row = await loadPendingAction(actionId);
  ensureActionUsable(row, token, options);
  const result = await persistPendingAction({
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
  if (result.error || result.saved < 1) throw new Error('취소 상태 저장 실패');
  return '취소했습니다.';
}

async function handlePendingActionCallback(data = '', options = {}) {
  const [verb, actionId, token] = String(data || '').split(':');
  if (!['confirm', 'cancel'].includes(verb) || !actionId || !token) {
    throw new Error('invalid callback data');
  }
  const response = verb === 'confirm'
    ? await confirmPendingAction(actionId, token, options)
    : await cancelPendingAction(actionId, token, options);
  return { verb, actionId, response };
}

module.exports = {
  createPendingAction,
  formatPendingActions,
  parseTradeMetadata,
  matchesInstrument,
  findRecommendationForTrade,
  findTradePlan,
  enrichTradeDraft,
  handlePendingActionCallback,
  confirmPendingAction,
  cancelPendingAction,
  ensureActionUsable,
};
