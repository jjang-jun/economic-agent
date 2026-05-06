const crypto = require('crypto');
const { loadPortfolio, enrichPortfolio, loadLatestPortfolioSnapshot } = require('../utils/portfolio');
const { buildFreedomStatus } = require('../utils/freedom-engine');
const strategyPolicy = require('../config/strategy-policy');
const { persistConversationMessage } = require('../utils/persistence');
const {
  formatPortfolioStatus,
  formatGoalStatus,
  formatRiskStatus,
  formatHelp,
} = require('./response-composer');

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

async function getEnrichedPortfolio() {
  const portfolio = await enrichPortfolio(loadPortfolio());
  const missingMarketValues = (portfolio.positions || []).some(position => !position.marketValue);
  if (missingMarketValues) {
    const latest = loadLatestPortfolioSnapshot();
    if (latest?.totalAssetValue) return latest;
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

  if (['/buy', '/sell', '/cash'].includes(command)) {
    return {
      intent: 'pending_action_not_implemented',
      response: '거래/현금 변경은 아직 바로 기록하지 않습니다. 다음 단계에서 승인 버튼 기반 pending action으로 추가합니다.',
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

  const result = await buildResponse(text);
  await persistConversationMessage({
    id,
    chatId: String(chatId),
    messageId,
    direction: 'inbound',
    intent: result.intent,
    text,
    response: result.response,
    dataCutoff: result.dataCutoff || {},
    status: 'answered',
    payload: { message },
  });

  return { allowed: true, ...result };
}

module.exports = {
  getAllowedChatIds,
  isAllowedChat,
  normalizeCommand,
  buildResponse,
  routeTelegramMessage,
};
