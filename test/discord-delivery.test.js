const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseWebhookMap,
  isDiscordWebhookUrl,
  resolveDiscordWebhook,
  reportHtmlToDiscordMarkdown,
  buildDiscordEmbed,
  buildDiscordPayload,
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

test('report HTML is converted to Discord Markdown and safe links', () => {
  assert.equal(
    reportHtmlToDiscordMarkdown('<b>정책</b> <a href="https://example.com/?a=1&amp;b=2">원문</a> <i>주의</i>'),
    '**정책** [원문](https://example.com/?a=1&b=2) *주의*',
  );
  assert.equal(
    reportHtmlToDiscordMarkdown('<strong>제목</strong><br><br><br><u>강조</u> <code>005930</code>&nbsp;'),
    '## 제목\n\n__강조__ `005930`',
  );
});

test('Discord Markdown promotes report structure, bullets, and caveats', () => {
  assert.equal(
    reportHtmlToDiscordMarkdown('🏛️ <b>정책 레이더</b>\n▸ 상태: 공식 발표\n<i>시행일을 확인하세요.</i>'),
    '## 🏛️ 정책 레이더\n- 상태: 공식 발표\n> *시행일을 확인하세요.*',
  );
});

test('Discord embeds use readable channel themes and bounded descriptions', () => {
  const embed = buildDiscordEmbed('시장 본문', {
    channel: 'briefing',
    index: 1,
    total: 3,
    now: '2026-08-04T08:00:00.000Z',
  });
  assert.equal(embed.title, '🗞️ 시장 브리핑 · 2/3');
  assert.equal(embed.description, '시장 본문');
  assert.equal(embed.color, 0x5865F2);
  assert.equal(embed.author.name, 'Economic Agent · #시장-브리핑');
  assert.equal(embed.footer.text, '자동 생성 리포트 · 원문과 최신 데이터를 함께 확인하세요');
  assert.equal(embed.timestamp, '2026-08-04T08:00:00.000Z');
});

test('Discord embeds lift report titles and operational metadata into fields', () => {
  const markdown = reportHtmlToDiscordMarkdown([
    '🚨 <b>Workflow 실패</b>',
    '<b>상태</b>  자동 작업이 완료되지 않았습니다',
    '<b>워크플로우</b>  Policy Radar',
    '<b>커밋</b>  <code>40520bd</code>',
    '',
    '🔎 <a href="https://example.com/run">실패 로그에서 원인 확인</a>',
  ].join('\n'));
  const embed = buildDiscordEmbed(markdown, { channel: 'ops' });
  assert.equal(embed.title, '🚨 Workflow 실패');
  assert.match(embed.description, /실패 로그에서 원인 확인/);
  assert.deepEqual(embed.fields.map(field => field.name), ['상태', '워크플로우', '커밋']);
  assert.equal(embed.fields[2].value, '`40520bd`');
});

test('Discord payload defaults to embeds and supports explicit plain-text fallback', () => {
  const rich = buildDiscordPayload('본문', { channel: 'portfolio' });
  assert.equal(rich.embeds.length, 1);
  assert.equal(rich.content, undefined);
  assert.deepEqual(rich.allowed_mentions, { parse: [] });

  const plain = buildDiscordPayload('본문', { channel: 'portfolio', useEmbeds: false });
  assert.equal(plain.content, '본문');
  assert.equal(plain.embeds, undefined);
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
    reportHtml: false,
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
  assert.ok(calls.every(call => call.body.embeds.length === 1));
  assert.ok(calls.every(call => call.body.embeds[0].title.startsWith('🛠️ 시스템 점검')));
  assert.ok(calls.every(call => call.body.embeds[0].description.length <= 45));
});

test('required Discord delivery fails closed when a channel is not configured', async () => {
  await assert.rejects(
    sendDiscordMessage('ops', { channel: 'ops', env: {}, requireDelivery: true }),
    /delivery is required/,
  );
});
