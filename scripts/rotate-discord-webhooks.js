const fs = require('fs');
const path = require('path');
const { DISCORD_CHANNELS } = require('../src/config/discord-channels');
const {
  DEFAULT_OUTPUT_FILE,
  WEBHOOK_NAME,
  discordRequest,
  loadExistingWebhookMap,
  saveWebhookMap,
} = require('./provision-discord');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_STATE_FILE = path.join(ROOT, 'data', 'discord-webhook-rotation.json');

function parseWebhookId(value) {
  try {
    const url = new URL(value);
    if (!['discord.com', 'www.discord.com'].includes(url.hostname)) return '';
    const match = url.pathname.match(/^\/api\/webhooks\/(\d{15,22})\//);
    return match?.[1] || '';
  } catch {
    return '';
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const keysArg = argv.find(value => value.startsWith('--keys='));
  return {
    revokeOld: argv.includes('--revoke-old'),
    keys: (keysArg?.slice('--keys='.length) || '').split(',').map(value => value.trim()).filter(Boolean),
    outputFile: process.env.DISCORD_WEBHOOKS_FILE || DEFAULT_OUTPUT_FILE,
    stateFile: process.env.DISCORD_WEBHOOK_ROTATION_STATE_FILE || DEFAULT_STATE_FILE,
  };
}

function validateKeys(keys) {
  if (keys.length === 0) throw new Error('--keys=channel_a,channel_b is required');
  const unique = [...new Set(keys)];
  const unknown = unique.filter(key => !DISCORD_CHANNELS[key]);
  if (unknown.length > 0) throw new Error(`Unknown Discord channel keys: ${unknown.join(', ')}`);
  return unique;
}

function saveRotationState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

async function prepareRotation(options, config = {}) {
  const keys = validateKeys(options.keys);
  const guildId = config.guildId || process.env.DISCORD_GUILD_ID;
  if (!/^[0-9]{15,22}$/.test(String(guildId || ''))) throw new Error('Valid DISCORD_GUILD_ID is required');
  if (fs.existsSync(options.stateFile)) {
    throw new Error('An unfinished webhook rotation exists. Verify and revoke it before starting another rotation.');
  }

  const webhookMap = loadExistingWebhookMap(options.outputFile);
  const channels = await discordRequest(`/guilds/${guildId}/channels`, {}, config);
  const rotations = [];

  for (const key of keys) {
    const channelConfig = DISCORD_CHANNELS[key];
    const channel = channels.find(item => item.type === 0 && item.name === channelConfig.name);
    if (!channel) throw new Error(`Discord channel not found: ${key}`);
    const oldWebhookId = parseWebhookId(webhookMap[key]);
    if (!oldWebhookId) throw new Error(`Current webhook URL is missing or invalid: ${key}`);
    const existing = await discordRequest(`/channels/${channel.id}/webhooks`, {}, config);
    if (!existing.some(item => item.id === oldWebhookId)) {
      throw new Error(`Current webhook is not installed in the expected channel: ${key}`);
    }
    const replacement = await discordRequest(`/channels/${channel.id}/webhooks`, {
      method: 'POST',
      reason: 'Rotate potentially exposed Economic Agent webhook',
      body: { name: WEBHOOK_NAME },
    }, config);
    if (!replacement?.id || !replacement?.token) throw new Error(`Replacement webhook token unavailable: ${key}`);
    webhookMap[key] = `https://discord.com/api/webhooks/${replacement.id}/${replacement.token}`;
    rotations.push({ key, channelId: channel.id, oldWebhookId, newWebhookId: replacement.id });
  }

  saveWebhookMap(options.outputFile, webhookMap);
  saveRotationState(options.stateFile, { createdAt: new Date().toISOString(), rotations });
  console.log(`[Discord] 새 Webhook 준비 완료 (${rotations.length}개). Secret 동기화와 smoke 후 --revoke-old를 실행하세요.`);
  return rotations;
}

async function revokeOld(options, config = {}) {
  if (!fs.existsSync(options.stateFile)) throw new Error('Webhook rotation state file not found');
  const state = JSON.parse(fs.readFileSync(options.stateFile, 'utf8'));
  const webhookMap = loadExistingWebhookMap(options.outputFile);
  for (const rotation of state.rotations || []) {
    if (parseWebhookId(webhookMap[rotation.key]) !== rotation.newWebhookId) {
      throw new Error(`Local webhook map does not point to the replacement: ${rotation.key}`);
    }
  }
  for (const rotation of state.rotations || []) {
    await discordRequest(`/webhooks/${rotation.oldWebhookId}`, {
      method: 'DELETE',
      reason: 'Revoke rotated Economic Agent webhook after verified replacement',
    }, config);
  }
  fs.unlinkSync(options.stateFile);
  console.log(`[Discord] 기존 Webhook 폐기 완료 (${state.rotations?.length || 0}개)`);
}

async function main() {
  const options = parseArgs();
  if (options.revokeOld) return revokeOld(options);
  return prepareRotation(options);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[Discord] Webhook 회전 실패: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_STATE_FILE,
  parseWebhookId,
  parseArgs,
  validateKeys,
  prepareRotation,
  revokeOld,
};
