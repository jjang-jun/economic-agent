const { routeTelegramMessage, routeTelegramCallback } = require('../agent/agent-router');
const { sendTelegramMessage, answerTelegramCallbackQuery } = require('../notify/telegram');

function getWebhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_SECRET_TOKEN || '';
}

function verifyTelegramSecret(req) {
  const expected = getWebhookSecret();
  if (!expected) return true;
  const actual = req.headers['x-telegram-bot-api-secret-token'];
  return actual === expected;
}

async function handleTelegramWebhook(req, res, body) {
  if (!verifyTelegramSecret(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid secret token' }));
    return;
  }

  let update;
  try {
    update = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
    return;
  }

  const callbackQuery = update.callback_query;
  if (callbackQuery) {
    try {
      const result = await routeTelegramCallback(callbackQuery);
      await answerTelegramCallbackQuery(callbackQuery.id, result.response);
      if (result.allowed) {
        await sendTelegramMessage(result.response, {
          chatId: callbackQuery.message?.chat?.id,
        });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, intent: result.intent || 'callback' }));
    } catch (err) {
      console.error(`[AgentWebhook] callback 처리 실패: ${err.message}`);
      if (callbackQuery.id) await answerTelegramCallbackQuery(callbackQuery.id, '처리 실패');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'internal error' }));
    }
    return;
  }

  const message = update.message || update.edited_message;
  if (!message?.chat?.id || !message.text) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ignored: true }));
    return;
  }

  try {
    const result = await routeTelegramMessage(message);
    if (result.allowed) {
      await sendTelegramMessage(result.response, {
        chatId: message.chat.id,
        replyMarkup: result.replyMarkup,
      });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, intent: result.intent || 'blocked' }));
  } catch (err) {
    console.error(`[AgentWebhook] 처리 실패: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'internal error' }));
  }
}

module.exports = {
  handleTelegramWebhook,
  verifyTelegramSecret,
};
