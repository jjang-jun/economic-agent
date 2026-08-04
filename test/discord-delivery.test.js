const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseWebhookMap,
  isDiscordWebhookUrl,
  resolveDiscordWebhook,
  telegramHtmlToDiscordMarkdown,
  splitDiscordMessage,
  sendDiscordMessage,
  inspectDiscordConfiguration,
} = require('../src/notify/discord');

const OPS_WEBHOOK = 'https://discord.com/api/webhooks/123456789/secret-token';

test('Discord webhook map supports base64 configuration without exposing URLs in inspection', () => {
  const encoded = Buffer.from(JSON.stringify({ ops: OPS_WEBHOOK })).toString('base64');
  const env = { DISCORD_WEBHOOKS_JSON_BASE64: encoded };
  assert.deepEqual(parseWebhookMap(env), { ops: OPS_WEBHOOK });
  assert.deepEqual(resolveDiscordWebhook('ops', env), {
    configured: true,
    channel: 'ops',
    source: 'webhook_map',
    url: OPS_WEBHOOK,
  });
  const inspection = inspectDiscordConfiguration(env);
  assert.equal(inspection.find(row => row.key === 'ops').configured, true);
  assert.equal(JSON.stringify(inspection).includes('secret-token'), false);
});

test('Discord webhook map supports the private local provision file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'economic-agent-discord-map-'));
  const file = path.join(dir, 'discord-webhooks.json');
  fs.writeFileSync(file, JSON.stringify({ ops: OPS_WEBHOOK }));
  const env = { DISCORD_WEBHOOKS_FILE: file };
  assert.deepEqual(resolveDiscordWebhook('ops', env), {
    configured: true,
    channel: 'ops',
    source: 'local_file',
    url: OPS_WEBHOOK,
  });
});

test('Discord webhook validation rejects non-Discord and insecure URLs', () => {
  assert.equal(isDiscordWebhookUrl(OPS_WEBHOOK), true);
  assert.equal(isDiscordWebhookUrl('http://discord.com/api/webhooks/123/token'), false);
  assert.equal(isDiscordWebhookUrl('https://example.com/api/webhooks/123/token'), false);
  assert.throws(
    () => resolveDiscordWebhook('ops', { DISCORD_WEBHOOK_OPS: 'https://example.com/hook' }),
    /Invalid Discord webhook URL/,
  );
});

test('Telegram HTML is converted to Discord Markdown and safe links', () => {
  assert.equal(
    telegramHtmlToDiscordMarkdown('<b>정책</b> <a href="https://example.com/?a=1&amp;b=2">원문</a> <i>주의</i>'),
    '**정책** [원문](https://example.com/?a=1&b=2) *주의*',
  );
});

test('Discord message splitter preserves all content within bounded chunks', () => {
  const text = `첫 문단 ${'가'.repeat(50)}\n\n둘째 문단 ${'나'.repeat(50)}`;
  const chunks = splitDiscordMessage(text, 40);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every(chunk => chunk.length <= 40));
  assert.equal(chunks.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
});

test('Discord sender disables mentions, waits for delivery, and splits long messages', async () => {
  const calls = [];
  const result = await sendDiscordMessage(`@everyone ${'보고서 '.repeat(20)}`, {
    channel: 'ops',
    webhookUrl: OPS_WEBHOOK,
    telegramHtml: false,
    maxLength: 45,
    fetcher: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return { ok: true, status: 200, text: async () => '' };
    },
  });
  assert.equal(result.delivered, true);
  assert.ok(result.messageCount > 1);
  assert.ok(calls.every(call => new URL(call.url).searchParams.get('wait') === 'true'));
  assert.ok(calls.every(call => call.body.allowed_mentions.parse.length === 0));
});

test('required Discord delivery fails closed when a channel is not configured', async () => {
  await assert.rejects(
    sendDiscordMessage('ops', { channel: 'ops', env: {}, requireDelivery: true }),
    /delivery is required/,
  );
});
