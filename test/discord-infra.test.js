const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseArgs,
  buildSmokeMessage,
  formatConfigurationReport,
} = require('../scripts/discord-infra');
const { loadAndValidateWebhookMap } = require('../scripts/sync-discord-secret');

test('Discord infrastructure CLI parses smoke and channel flags', () => {
  assert.deepEqual(parseArgs(['--send-test', '--channel=policy_tax']), {
    sendTest: true,
    channel: 'policy_tax',
  });
  assert.deepEqual(parseArgs(['--send-test', '--channel=']), {
    sendTest: true,
    channel: 'ops',
  });
});

test('Discord health smoke summarizes full configuration and scheduled context', () => {
  const message = buildSmokeMessage({
    target: { name: '시스템-점검' },
    configured: 9,
    total: 9,
    now: new Date('2026-08-04T23:10:00.000Z'),
    env: {
      GITHUB_EVENT_NAME: 'schedule',
      GITHUB_SHA: 'abcdef123456',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '123',
    },
  });
  assert.match(message, /평일 장전 자동 점검/);
  assert.match(message, /9\/9개 정상/);
  assert.match(message, /abcdef1/);
  assert.match(message, /actions\/runs\/123/);
});

test('Discord configuration report contains status but never webhook secrets', () => {
  const report = formatConfigurationReport([{
    key: 'ops',
    name: '시스템-점검',
    configured: true,
    valid: true,
    source: 'webhook_map',
  }]);
  assert.match(report, /ops \(#시스템-점검\): 설정됨/);
  assert.doesNotMatch(report, /https:\/\//);
});

test('Discord secret sync validates channel keys and webhook URLs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'economic-agent-discord-'));
  const validFile = path.join(dir, 'valid.json');
  const invalidFile = path.join(dir, 'invalid.json');
  fs.writeFileSync(validFile, JSON.stringify({
    ops: 'https://discord.com/api/webhooks/123456/token',
  }));
  fs.writeFileSync(invalidFile, JSON.stringify({
    unknown: 'https://discord.com/api/webhooks/123456/token',
  }));
  assert.equal(loadAndValidateWebhookMap(validFile).ops.includes('discord.com'), true);
  assert.throws(() => loadAndValidateWebhookMap(invalidFile), /Unknown Discord channel key/);
});
