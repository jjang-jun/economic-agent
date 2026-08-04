const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isDiscordReportsEnabled,
  sendDiscordCopy,
} = require('../src/notify/multi-channel');

test('Discord report copies require an explicit enable flag', () => {
  assert.equal(isDiscordReportsEnabled({}), false);
  assert.equal(isDiscordReportsEnabled({ DISCORD_REPORTS_ENABLED: 'false' }), false);
  assert.equal(isDiscordReportsEnabled({ DISCORD_REPORTS_ENABLED: 'true' }), true);
});

test('disabled Discord report copy performs no network delivery', async () => {
  let calls = 0;
  const result = await sendDiscordCopy('보고서', 'ops', {
    env: {},
    sender: async () => { calls += 1; },
  });
  assert.equal(result.delivered, false);
  assert.equal(result.reason, 'disabled');
  assert.equal(calls, 0);
});

test('Discord report failures are isolated from primary Telegram delivery', async () => {
  const result = await sendDiscordCopy('보고서', 'ops', {
    env: { DISCORD_REPORTS_ENABLED: 'true' },
    sender: async () => { throw new Error('temporary outage'); },
  });
  assert.equal(result.enabled, true);
  assert.equal(result.delivered, false);
  assert.match(result.error, /temporary outage/);
});
