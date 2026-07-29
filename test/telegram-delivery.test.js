const test = require('node:test');
const assert = require('node:assert/strict');

function loadFreshTelegram(envPatch = {}) {
  const keys = Object.keys(envPatch);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(envPatch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const modulePath = require.resolve('../src/notify/telegram');
  delete require.cache[modulePath];
  const telegram = require('../src/notify/telegram');

  return {
    telegram,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      delete require.cache[modulePath];
    },
  };
}

test('required Telegram delivery fails when credentials are missing', async () => {
  const { telegram, restore } = loadFreshTelegram({
    TELEGRAM_BOT_TOKEN: undefined,
    TELEGRAM_CHAT_ID: undefined,
    TELEGRAM_PRIVATE_CHAT_ID: undefined,
    TELEGRAM_SECRET_CHAT_ID: undefined,
  });

  try {
    await assert.rejects(
      telegram.sendTelegramMessage('ops alert', { channel: 'private', requireDelivery: true }),
      /delivery is required/,
    );
  } finally {
    restore();
  }
});

test('scheduled digest and stock report never treat preview mode as delivered', async () => {
  const { telegram, restore } = loadFreshTelegram({
    TELEGRAM_BOT_TOKEN: undefined,
    TELEGRAM_CHAT_ID: undefined,
    TELEGRAM_PRIVATE_CHAT_ID: undefined,
    TELEGRAM_SECRET_CHAT_ID: undefined,
  });

  try {
    assert.equal(await telegram.sendDigest({
      sessionName: '테스트',
      articleCount: 0,
      market_mood: 'neutral',
      headline: '테스트',
      sections: [],
    }), false);
    assert.equal(await telegram.sendStockReport({
      market_summary: '테스트',
      sectors: [],
      stocks: [],
      action_items: [],
      risk_flags: [],
    }), false);
  } finally {
    restore();
  }
});

test('Telegram delivery uses a bounded request timeout', async () => {
  const previousFetch = global.fetch;
  global.fetch = async (_url, options = {}) => new Promise((resolve, reject) => {
    const keepAlive = setTimeout(resolve, 1000);
    options.signal?.addEventListener('abort', () => {
      clearTimeout(keepAlive);
      reject(options.signal.reason);
    }, { once: true });
  });

  const { telegram, restore } = loadFreshTelegram({
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_CHAT_ID: '1234',
    TELEGRAM_REQUEST_TIMEOUT_MS: '10',
  });

  try {
    await assert.rejects(
      telegram.sendTelegramMessage('ops alert', { requireDelivery: true }),
      /Telegram request timed out after 10ms/,
    );
  } finally {
    restore();
    global.fetch = previousFetch;
  }
});
