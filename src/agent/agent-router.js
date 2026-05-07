const crypto = require('crypto');
const { loadPortfolio, enrichPortfolio, loadLatestPortfolioSnapshot } = require('../utils/portfolio');
const { buildFreedomStatus } = require('../utils/freedom-engine');
const strategyPolicy = require('../config/strategy-policy');
const {
  persistConversationMessage,
  loadLatestPersistedPortfolioSnapshot,
} = require('../utils/persistence');
const { loadStoredPortfolio } = require('../utils/portfolio-store');
const {
  formatPortfolioStatus,
  formatGoalStatus,
  formatRiskStatus,
  formatHelp,
} = require('./response-composer');
const { createPendingAction, handlePendingActionCallback } = require('./pending-actions');

function getAllowedChatIds() {
  return [
    process.env.TELEGRAM_SECRET_CHAT_ID,
    process.env.TELEGRAM_PRIVATE_CHAT_ID,
    process.env.TELEGRAM_AGENT_CHAT_ID,
    process.env.TELEGRAM_PORTFOLIO_CHAT_ID,
    process.env.TELEGRAM_CHAT_ID,
  ].filter(Boolean).map(String);
}

function isAllowedChat(chatId) {
  const allowed = getAllowedChatIds();
  return allowed.length > 0 && allowed.includes(String(chatId));
}

function normalizeCommand(text = '') {
  const cleaned = String(text || '').trim();
  const command = cleaned.split(/\s+/)[0].toLowerCase();
  return command.replace(/@[\w_]+$/, '');
}

function isPendingActionCommand(command) {
  return ['/buy', '/sell', '/cash'].includes(command);
}

async function getEnrichedPortfolio() {
  const storedPortfolio = await loadStoredPortfolio();
  if (storedPortfolio?.cashAmount !== null || (storedPortfolio?.positions || []).length > 0) {
    return enrichPortfolio(storedPortfolio);
  }

  const rawPortfolio = loadPortfolio();
  if (!rawPortfolio.totalAssetValue && !rawPortfolio.cashAmount && (rawPortfolio.positions || []).length === 0) {
    const persisted = await loadLatestPersistedPortfolioSnapshot();
    const snapshot = persisted.rows?.[0];
    if (snapshot?.totalAssetValue) return snapshot;
  }

  const portfolio = await enrichPortfolio(rawPortfolio);
  const missingMarketValues = (portfolio.positions || []).some(position => !position.marketValue);
  if (missingMarketValues) {
    const latest = loadLatestPortfolioSnapshot();
    if (latest?.totalAssetValue) return latest;
    const persisted = await loadLatestPersistedPortfolioSnapshot();
    const snapshot = persisted.rows?.[0];
    if (snapshot?.totalAssetValue) return snapshot;
  }
  return portfolio;
}

async function buildResponse(text) {
  const command = normalizeCommand(text);
  if (!command || command === '/start' || command === '/help') {
    return { intent: 'help', response: formatHelp() };
  }

  if (command === '/portfolio') {
    const portfolio = await getEnrichedPortfolio();
    return {
      intent: 'portfolio_status',
      response: formatPortfolioStatus(portfolio),
      dataCutoff: { portfolio: portfolio.capturedAt },
    };
  }

  if (command === '/goal') {
    const portfolio = await getEnrichedPortfolio();
    const status = buildFreedomStatus({ portfolio });
    return {
      intent: 'freedom_status',
      response: formatGoalStatus(status),
      dataCutoff: { portfolio: portfolio.capturedAt, freedom: status.generatedAt },
    };
  }

  if (command === '/risk') {
    const portfolio = await getEnrichedPortfolio();
    return {
      intent: 'risk_status',
      response: formatRiskStatus({ portfolio, policy: strategyPolicy }),
      dataCutoff: { portfolio: portfolio.capturedAt },
    };
  }

  if (isPendingActionCommand(command)) {
    return {
      intent: 'pending_action_requires_chat',
      response: '거래/현금 변경은 Telegram 승인 버튼이 필요합니다. Telegram 대화에서 실행해주세요.',
    };
  }

  return {
    intent: 'unknown',
    response: formatHelp(),
  };
}

async function routeTelegramMessage(message = {}) {
  const chatId = message.chat?.id;
  const text = message.text || '';
  const messageId = message.message_id ? String(message.message_id) : '';
  const id = crypto.randomUUID();

  if (!isAllowedChat(chatId)) {
    await persistConversationMessage({
      id,
      chatId: String(chatId || ''),
      messageId,
      direction: 'inbound',
      intent: 'unauthorized',
      text,
      status: 'blocked',
      payload: { message },
    });
    return { allowed: false, response: '허용되지 않은 Telegram chat_id입니다.' };
  }

  const command = normalizeCommand(text);
  let result;
  if (isPendingActionCommand(command)) {
    try {
      const draft = await createPendingAction({ chatId, text });
      result = {
        intent: `draft_${command.slice(1)}`,
        response: draft.response,
        replyMarkup: draft.replyMarkup,
        pendingActionId: draft.action.id,
      };
    } catch (err) {
      result = {
        intent: 'pending_action_invalid',
        response: err.message,
      };
    }
  } else {
    result = await buildResponse(text);
  }
  await persistConversationMessage({
    id,
    chatId: String(chatId),
    messageId,
    direction: 'inbound',
    intent: result.intent,
    text,
    response: result.response,
    dataCutoff: result.dataCutoff || {},
    pendingActionId: result.pendingActionId || null,
    status: 'answered',
    payload: { message },
  });

  return { allowed: true, ...result };
}

async function routeTelegramCallback(callbackQuery = {}) {
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data || '';
  const id = crypto.randomUUID();

  if (!isAllowedChat(chatId)) {
    await persistConversationMessage({
      id,
      chatId: String(chatId || ''),
      messageId: callbackQuery.message?.message_id ? String(callbackQuery.message.message_id) : '',
      direction: 'callback',
      intent: 'unauthorized',
      text: data,
      status: 'blocked',
      payload: { callbackQuery },
    });
    return { allowed: false, response: '허용되지 않은 Telegram chat_id입니다.' };
  }

  const result = await handlePendingActionCallback(data);
  await persistConversationMessage({
    id,
    chatId: String(chatId),
    messageId: callbackQuery.message?.message_id ? String(callbackQuery.message.message_id) : '',
    direction: 'callback',
    intent: `pending_action_${result.verb}`,
    text: data,
    response: result.response,
    pendingActionId: result.actionId,
    status: 'answered',
    payload: { callbackQuery },
  });
  return { allowed: true, intent: `pending_action_${result.verb}`, response: result.response };
}

module.exports = {
  getAllowedChatIds,
  isAllowedChat,
  normalizeCommand,
  buildResponse,
  routeTelegramMessage,
  routeTelegramCallback,
};
