const assert = require('node:assert/strict');
const { routeTelegramMessage, routeTelegramCallback, getAllowedChatIds } = require('../src/agent/agent-router');
const { isPersistenceEnabled, loadPendingAction, selectRows } = require('../src/utils/persistence');
const { loadStoredPortfolio } = require('../src/utils/portfolio-store');
const { loadPortfolio, normalizePortfolio } = require('../src/utils/portfolio');

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function messageId() {
  return Math.floor(Date.now() / 1000);
}

function getCancelCallbackData(replyMarkup) {
  const buttons = replyMarkup?.inline_keyboard?.flat() || [];
  return buttons.find(button => String(button.callback_data || '').startsWith('cancel:'))?.callback_data || '';
}

async function smokeDraftAndCancel({ chatId, text, expectedIntent }) {
  const message = {
    message_id: messageId(),
    chat: { id: chatId },
    text,
  };
  const draft = await routeTelegramMessage(message);
  assert.equal(draft.allowed, true, `${text} should be allowed`);
  assert.equal(draft.intent, expectedIntent, `${text} should create ${expectedIntent}`);
  assert.ok(draft.pendingActionId, `${text} should create pending action`);

  const row = await loadPendingAction(draft.pendingActionId);
  assert.equal(row?.status, 'pending', `${text} pending action should be pending`);
  assert.equal(String(row.chat_id), String(chatId), `${text} pending action should be tied to chat`);

  const cancelData = getCancelCallbackData(draft.replyMarkup);
  assert.ok(cancelData, `${text} should include cancel callback`);
  const cancel = await routeTelegramCallback({
    id: `smoke:${draft.pendingActionId}`,
    data: cancelData,
    message: {
      message_id: messageId() + 1,
      chat: { id: chatId },
    },
  });
  assert.equal(cancel.allowed, true, `${text} cancel should be allowed`);
  assert.equal(cancel.intent, 'pending_action_cancel', `${text} cancel intent`);

  const cancelled = await loadPendingAction(draft.pendingActionId);
  assert.equal(cancelled?.status, 'cancelled', `${text} pending action should be cancelled`);

  return {
    text,
    actionId: draft.pendingActionId,
    status: cancelled.status,
  };
}

async function smokeReadCommand({ chatId, text, expectedIntent, expectedText }) {
  const result = await routeTelegramMessage({
    message_id: messageId(),
    chat: { id: chatId },
    text,
  });
  assert.equal(result.allowed, true, `${text} should be allowed`);
  assert.equal(result.intent, expectedIntent, `${text} intent`);
  assert.match(result.response, expectedText, `${text} response`);
  return { text, intent: result.intent, status: 'read_ok' };
}

async function getCurrentCashAmount() {
  const stored = await loadStoredPortfolio();
  const portfolio = stored || normalizePortfolio(loadPortfolio());
  return typeof portfolio.cashAmount === 'number' ? portfolio.cashAmount : 0;
}

async function getSmokeInstrument() {
  const stored = await loadStoredPortfolio();
  const portfolio = stored || normalizePortfolio(loadPortfolio());
  const position = (portfolio.positions || []).find(item => Number(item.quantity) >= 1);
  if (!position) throw new Error('Telegram sell smoke requires at least one held position');
  return {
    ticker: position.ticker || position.symbol,
    name: String(position.name || 'smoke-position').replace(/\s+/g, '_'),
    price: Number(position.avgPrice || position.currentPrice || 1),
  };
}

async function assertPersistenceAvailable() {
  if (!isPersistenceEnabled()) {
    throw new Error('Supabase persistence is not configured for Telegram smoke');
  }

  const result = await selectRows('pending_actions', {
    select: 'id',
    limit: '1',
  });
  if (result.error) {
    const err = new Error(`Supabase persistence unavailable for Telegram smoke: ${result.error.message}`);
    err.status = result.error.status;
    err.transientSupabase = isTransientSupabaseError(result.error);
    throw err;
  }
}

function isTransientSupabaseError(err) {
  if (!err) return false;
  if (err.transientSupabase) return true;
  if (typeof err.status === 'number') {
    return err.status === 408 || err.status === 429 || err.status >= 500;
  }
  return /schema cache|temporarily disabled|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|\b(?:408|429|5\d\d)\b/i
    .test(String(err.message || err));
}

async function runTelegramSmoke() {
  const chatId = process.env.TELEGRAM_SMOKE_CHAT_ID || getAllowedChatIds()[0];
  if (!chatId) throw new Error('TELEGRAM_SECRET_CHAT_ID or TELEGRAM_SMOKE_CHAT_ID is required');

  await assertPersistenceAvailable();
  const [cashAmount, instrument] = await Promise.all([getCurrentCashAmount(), getSmokeInstrument()]);
  const commands = [
    { text: '/buy 005930 1 1 smoke-buy', expectedIntent: 'draft_buy' },
    { text: `/sell ${instrument.ticker} 1 ${instrument.price} ${instrument.name} reason=smoke`, expectedIntent: 'draft_sell' },
    { text: `/cash ${cashAmount}`, expectedIntent: 'draft_cash' },
  ];

  const results = [];
  for (const command of commands) {
    results.push(await smokeDraftAndCancel({ chatId, ...command }));
  }
  results.push(await smokeReadCommand({
    chatId,
    text: '/trades',
    expectedIntent: 'recent_trades',
    expectedText: /최근 실제 체결 기록/,
  }));
  results.push(await smokeReadCommand({
    chatId,
    text: '/trade_performance',
    expectedIntent: 'trade_performance',
    expectedText: /실제 거래 성과/,
  }));

  console.log(JSON.stringify({
    ok: true,
    checked: results.length,
    results,
  }, null, 2));
}

async function main() {
  try {
    await runTelegramSmoke();
  } catch (err) {
    if (isTruthyEnv(process.env.TELEGRAM_SMOKE_ALLOW_TRANSIENT_SUPABASE) && isTransientSupabaseError(err)) {
      console.warn(`[telegram-smoke] skipped: transient Supabase outage: ${err.message}`);
      console.warn(`::warning title=Telegram smoke skipped::${String(err.message || err).replace(/[\r\n]+/g, ' ')}`);
      console.log(JSON.stringify({
        ok: false,
        skipped: true,
        reason: 'transient_supabase_unavailable',
        message: err.message,
      }, null, 2));
      return;
    }
    throw err;
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[telegram-smoke] failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  assertPersistenceAvailable,
  getCancelCallbackData,
  isTransientSupabaseError,
  isTruthyEnv,
  main,
  runTelegramSmoke,
  smokeDraftAndCancel,
};
