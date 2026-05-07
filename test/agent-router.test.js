const test = require('node:test');
const assert = require('node:assert/strict');
const { getAllowedChatIds } = require('../src/agent/agent-router');

function withEnv(patch, fn) {
  const keys = Object.keys(patch);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('getAllowedChatIds prefers private chat ids over shared Telegram chat id', () => {
  withEnv({
    TELEGRAM_SECRET_CHAT_ID: 'private',
    TELEGRAM_PRIVATE_CHAT_ID: undefined,
    TELEGRAM_AGENT_CHAT_ID: undefined,
    TELEGRAM_PORTFOLIO_CHAT_ID: undefined,
    TELEGRAM_CHAT_ID: 'shared',
  }, () => {
    assert.deepEqual(getAllowedChatIds(), ['private']);
  });
});

test('getAllowedChatIds falls back to shared chat only when no private id exists', () => {
  withEnv({
    TELEGRAM_SECRET_CHAT_ID: undefined,
    TELEGRAM_PRIVATE_CHAT_ID: undefined,
    TELEGRAM_AGENT_CHAT_ID: undefined,
    TELEGRAM_PORTFOLIO_CHAT_ID: undefined,
    TELEGRAM_CHAT_ID: 'shared',
  }, () => {
    assert.deepEqual(getAllowedChatIds(), ['shared']);
  });
});
