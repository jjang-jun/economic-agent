const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { DISCORD_CHANNELS } = require('../src/config/discord-channels');
const { isDiscordWebhookUrl } = require('../src/notify/discord');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'discord-webhooks.json');

function loadAndValidateWebhookMap(file = process.env.DISCORD_WEBHOOKS_FILE || DEFAULT_FILE) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Discord webhook file must contain a JSON object');
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (!DISCORD_CHANNELS[key]) throw new Error(`Unknown Discord channel key: ${key}`);
    if (!isDiscordWebhookUrl(value)) throw new Error(`Invalid Discord webhook URL for channel: ${key}`);
  }
  if (Object.keys(parsed).length === 0) throw new Error('Discord webhook file is empty');
  return parsed;
}

function main() {
  const file = process.argv[2] || process.env.DISCORD_WEBHOOKS_FILE || DEFAULT_FILE;
  const webhooks = loadAndValidateWebhookMap(file);
  const encoded = Buffer.from(JSON.stringify(webhooks)).toString('base64');
  const result = spawnSync('gh', ['secret', 'set', 'DISCORD_WEBHOOKS_JSON_BASE64'], {
    input: encoded,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) process.exit(result.status || 1);
  console.log(`[Discord] GitHub Actions secret 동기화 완료 (${Object.keys(webhooks).length}개 채널)`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[Discord] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { DEFAULT_FILE, loadAndValidateWebhookMap };
