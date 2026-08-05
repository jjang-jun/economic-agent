const test = require('node:test');
const assert = require('node:assert/strict');
const { DISCORD_COMMANDS, discordInteractionToAgentText } = require('../src/config/discord-commands');
const { requireDiscordCommandConfig, syncDiscordCommands } = require('../scripts/sync-discord-commands');

function response(status, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  };
}

test('Discord guild command list exposes only read-only economic office queries', () => {
  assert.deepEqual(DISCORD_COMMANDS.map(command => command.name), [
    'portfolio',
    'goal',
    'risk',
    'recommendations',
    'trades',
    'trade-performance',
  ]);
  assert.equal(DISCORD_COMMANDS.some(command => ['buy', 'sell', 'cash'].includes(command.name)), false);
  assert.ok(DISCORD_COMMANDS.every(command => command.dm_permission === false));
});

test('Discord command mapper preserves the recommendations blocked option', () => {
  assert.equal(discordInteractionToAgentText({ data: { name: 'portfolio' } }), '/portfolio');
  assert.equal(discordInteractionToAgentText({
    data: {
      name: 'recommendations',
      options: [{ name: 'include_blocked', value: true }],
    },
  }), '/recommendations blocked');
  assert.equal(discordInteractionToAgentText({ data: { name: 'buy' } }), '');
});

test('Discord command sync bulk-overwrites guild commands without logging token in result', async () => {
  const calls = [];
  const env = {
    DISCORD_BOT_TOKEN: 'secret-token',
    DISCORD_APPLICATION_ID: '123456789012345678',
    DISCORD_GUILD_ID: '987654321098765432',
  };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return response(200, DISCORD_COMMANDS.map((command, index) => ({ id: String(index + 1), ...command })));
  };
  const result = await syncDiscordCommands({ env, fetcher, apiBase: 'https://discord.test/api/v10' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].url, 'https://discord.test/api/v10/applications/123456789012345678/guilds/987654321098765432/commands');
  assert.equal(calls[0].options.headers.Authorization, 'Bot secret-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), DISCORD_COMMANDS);
  assert.equal(result.synced, DISCORD_COMMANDS.length);
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
});

test('Discord command sync configuration fails closed when an ID is missing', () => {
  assert.throws(() => requireDiscordCommandConfig({
    DISCORD_BOT_TOKEN: 'token',
    DISCORD_APPLICATION_ID: '',
    DISCORD_GUILD_ID: '987654321098765432',
  }), /DISCORD_APPLICATION_ID/);
});
