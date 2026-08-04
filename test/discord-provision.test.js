const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DISCORD_CATEGORIES, DISCORD_CHANNELS } = require('../src/config/discord-channels');
const {
  parseArgs,
  hasProvisionPermissions,
  planInfrastructure,
  provisionDiscordInfrastructure,
} = require('../scripts/provision-discord');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('Discord provision CLI is dry-run by default and requires explicit apply', () => {
  assert.deepEqual(parseArgs([]).apply, false);
  assert.deepEqual(parseArgs(['--apply', '--output=/tmp/discord.json']), {
    apply: true,
    outputFile: '/tmp/discord.json',
  });
});

test('Discord provisioning accepts administrator or the three minimum permissions', () => {
  assert.equal(hasProvisionPermissions('8'), true);
  assert.equal(hasProvisionPermissions(String(16 + 1024 + 536870912)), true);
  assert.equal(hasProvisionPermissions(String(16 + 1024)), false);
});

test('Discord infrastructure plan migrates the legacy category and places channels structurally', () => {
  const plan = planInfrastructure([
    { id: 'category', type: 4, name: 'Economic Agent' },
    { id: 'ops', type: 0, name: '시스템-점검', parent_id: 'category' },
  ]);
  assert.equal(plan.categories.find(item => item.key === 'signals').action, 'rename');
  assert.equal(plan.categories.find(item => item.key === 'assets').action, 'create');
  assert.equal(plan.channels.find(item => item.key === 'ops').action, 'move');
  assert.equal(plan.channels.find(item => item.key === 'policy_tax').action, 'create');
});

test('Discord provisioning dry-run makes no mutation requests', async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, method: options.method });
    if (url.endsWith('/users/@me/guilds')) return response(200, [{ id: '123456789012345678', name: '경제 서버', permissions: '8' }]);
    if (url.endsWith('/guilds/123456789012345678/channels')) return response(200, []);
    return response(404, {});
  };
  const result = await provisionDiscordInfrastructure({ apply: false }, {
    token: 'token',
    guildId: '123456789012345678',
    fetcher,
  });
  assert.equal(result.applied, false);
  assert.equal(result.plan.categories.length, Object.keys(DISCORD_CATEGORIES).length);
  assert.equal(result.plan.channels.length, Object.keys(DISCORD_CHANNELS).length);
  assert.ok(calls.every(call => call.method === 'GET'));
});

test('Discord provisioning creates missing resources and writes a private webhook map', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'economic-agent-provision-'));
  const outputFile = path.join(dir, 'discord-webhooks.json');
  let channelSequence = 0;
  let categorySequence = 0;
  let webhookSequence = 0;
  const fetcher = async (url, options = {}) => {
    const method = options.method || 'GET';
    if (url.endsWith('/users/@me/guilds')) return response(200, [{ id: '123456789012345678', name: '경제 서버', permissions: '8' }]);
    if (url.endsWith('/guilds/123456789012345678/channels') && method === 'GET') return response(200, []);
    if (url.endsWith('/guilds/123456789012345678/channels') && method === 'POST') {
      const body = JSON.parse(options.body);
      if (body.type === 4) {
        categorySequence += 1;
        return response(201, { id: `category-${categorySequence}`, ...body });
      }
      channelSequence += 1;
      return response(201, { id: `channel-${channelSequence}`, ...body });
    }
    if (/\/channels\/channel-\d+\/webhooks$/.test(url) && method === 'GET') return response(200, []);
    if (/\/channels\/channel-\d+\/webhooks$/.test(url) && method === 'POST') {
      webhookSequence += 1;
      return response(200, { id: `1000${webhookSequence}`, token: `token-${webhookSequence}`, name: 'Economic Agent' });
    }
    return response(404, { message: 'unexpected route' });
  };

  const result = await provisionDiscordInfrastructure({ apply: true, outputFile }, {
    token: 'token',
    guildId: '123456789012345678',
    fetcher,
  });
  const stored = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  assert.equal(result.createdChannels, Object.keys(DISCORD_CHANNELS).length);
  assert.equal(result.createdCategories, Object.keys(DISCORD_CATEGORIES).length);
  assert.equal(result.movedChannels, 0);
  assert.equal(result.createdWebhooks, Object.keys(DISCORD_CHANNELS).length);
  assert.deepEqual(Object.keys(stored).sort(), Object.keys(DISCORD_CHANNELS).sort());
  assert.equal(fs.statSync(outputFile).mode & 0o777, 0o600);
});

test('Discord provisioning renames the legacy category and moves existing channels without recreating them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'economic-agent-migrate-'));
  const outputFile = path.join(dir, 'discord-webhooks.json');
  const existing = [
    { id: 'legacy', type: 4, name: 'Economic Agent' },
    ...Object.entries(DISCORD_CHANNELS).map(([key, item]) => ({
      id: `channel-${key}`,
      type: 0,
      name: item.name,
      parent_id: 'legacy',
    })),
  ];
  const patches = [];
  let categorySequence = 0;
  const fetcher = async (url, options = {}) => {
    const method = options.method || 'GET';
    if (url.endsWith('/users/@me/guilds')) return response(200, [{ id: '123456789012345678', name: '경제 서버', permissions: '8' }]);
    if (url.endsWith('/guilds/123456789012345678/channels') && method === 'GET') return response(200, existing);
    if (url.endsWith('/guilds/123456789012345678/channels') && method === 'POST') {
      categorySequence += 1;
      return response(201, { id: `new-category-${categorySequence}`, ...JSON.parse(options.body) });
    }
    if (/\/channels\/(legacy|channel-[^/]+)$/.test(url) && method === 'PATCH') {
      patches.push({ url, body: JSON.parse(options.body) });
      return response(200, {});
    }
    if (/\/channels\/channel-[^/]+\/webhooks$/.test(url) && method === 'GET') {
      const key = url.match(/channel-([^/]+)\/webhooks$/)[1];
      return response(200, [{ id: `1000${patches.length}`, token: `token-${key}`, name: 'Economic Agent' }]);
    }
    return response(404, { message: 'unexpected route' });
  };

  const result = await provisionDiscordInfrastructure({ apply: true, outputFile }, {
    token: 'token',
    guildId: '123456789012345678',
    fetcher,
  });
  assert.equal(result.renamedCategories, 1);
  assert.equal(result.createdCategories, 3);
  assert.equal(result.createdChannels, 0);
  assert.equal(result.movedChannels, 5);
  assert.equal(result.reusedChannels, Object.keys(DISCORD_CHANNELS).length - 5);
  assert.equal(patches.filter(call => call.url.includes('channel-')).length, 5);
});

test('Discord provisioning rejects a valid token that is not installed in the configured guild', async () => {
  await assert.rejects(
    provisionDiscordInfrastructure({ apply: false }, {
      token: 'token',
      guildId: '123456789012345678',
      fetcher: async () => response(200, []),
    }),
    /not installed/,
  );
});
