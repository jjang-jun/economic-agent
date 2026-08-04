const test = require('node:test');
const assert = require('node:assert/strict');
const { BOT_COMMANDS, syncTelegramCommands } = require('../scripts/sync-telegram-commands');

test('Telegram command menu includes trade entry, history, and performance commands', () => {
  const names = BOT_COMMANDS.map(item => item.command);
  assert.ok(names.includes('buy'));
  assert.ok(names.includes('sell'));
  assert.ok(names.includes('trades'));
  assert.ok(names.includes('trade_performance'));
  assert.ok(BOT_COMMANDS.every(item => /^[a-z0-9_]{1,32}$/.test(item.command)));
});

test('syncTelegramCommands sends the complete menu to Telegram', async () => {
  let request;
  const result = await syncTelegramCommands({
    token: 'test-token',
    fetcher: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(result.commandCount, BOT_COMMANDS.length);
  assert.match(request.url, /setMyCommands$/);
  assert.deepEqual(JSON.parse(request.options.body).commands, BOT_COMMANDS);
});
