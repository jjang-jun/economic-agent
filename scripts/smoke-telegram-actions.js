const assert = require('node:assert/strict');
const { routeTelegramMessage, routeTelegramCallback, getAllowedChatIds } = require('../src/agent/agent-router');
const { loadPendingAction } = require('../src/utils/persistence');
const { loadStoredPortfolio } = require('../src/utils/portfolio-store');
const { loadPortfolio, normalizePortfolio } = require('../src/utils/portfolio');

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

async function getCurrentCashAmount() {
  const stored = await loadStoredPortfolio();
  const portfolio = stored || normalizePortfolio(loadPortfolio());
  return typeof portfolio.cashAmount === 'number' ? portfolio.cashAmount : 0;
}

async function main() {
  const chatId = process.env.TELEGRAM_SMOKE_CHAT_ID || getAllowedChatIds()[0];
  if (!chatId) throw new Error('TELEGRAM_SECRET_CHAT_ID or TELEGRAM_SMOKE_CHAT_ID is required');

  const cashAmount = await getCurrentCashAmount();
  const commands = [
    { text: '/buy 005930 1 1 smoke-buy', expectedIntent: 'draft_buy' },
    { text: '/sell 005930 1 1 smoke-sell', expectedIntent: 'draft_sell' },
    { text: `/cash ${cashAmount}`, expectedIntent: 'draft_cash' },
  ];

  const results = [];
  for (const command of commands) {
    results.push(await smokeDraftAndCancel({ chatId, ...command }));
  }

  console.log(JSON.stringify({
    ok: true,
    checked: results.length,
    results,
  }, null, 2));
}

main().catch(err => {
  console.error('[telegram-smoke] failed:', err.message);
  process.exit(1);
});
