const fs = require('fs');
const path = require('path');
const { DISCORD_CATEGORIES, DISCORD_CHANNELS } = require('../src/config/discord-channels');

const API_BASE = 'https://discord.com/api/v10';
const LEGACY_CATEGORY_NAME = 'Economic Agent';
const WEBHOOK_NAME = 'Economic Agent';
const DEFAULT_OUTPUT_FILE = path.join(__dirname, '..', 'data', 'discord-webhooks.json');
const PERMISSIONS = {
  administrator: 1n << 3n,
  manageChannels: 1n << 4n,
  viewChannels: 1n << 10n,
  manageWebhooks: 1n << 29n,
};

function parseArgs(argv = process.argv.slice(2)) {
  return {
    apply: argv.includes('--apply'),
    outputFile: argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length)
      || process.env.DISCORD_WEBHOOKS_FILE
      || DEFAULT_OUTPUT_FILE,
  };
}

function hasProvisionPermissions(value) {
  const permissions = BigInt(value || '0');
  if ((permissions & PERMISSIONS.administrator) !== 0n) return true;
  return (permissions & PERMISSIONS.manageChannels) !== 0n
    && (permissions & PERMISSIONS.viewChannels) !== 0n
    && (permissions & PERMISSIONS.manageWebhooks) !== 0n;
}

async function discordRequest(route, options = {}, config = {}) {
  const token = config.token || process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is required');
  const timeoutMs = Math.max(1, Number(config.timeoutMs || process.env.DISCORD_REQUEST_TIMEOUT_MS || 10000));
  const fetcher = config.fetcher || fetch;
  const res = await fetcher(`${API_BASE}${route}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'DiscordBot (https://github.com, 2.0)',
      ...(options.reason ? { 'X-Audit-Log-Reason': encodeURIComponent(options.reason) } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API ${options.method || 'GET'} ${route} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getInstalledGuild(guildId, config = {}) {
  const guilds = await discordRequest('/users/@me/guilds', {}, config);
  const guild = guilds.find(item => item.id === guildId);
  if (!guild) {
    throw new Error('Configured Discord bot is not installed in DISCORD_GUILD_ID. Reinstall the same app using Add to server.');
  }
  if (!hasProvisionPermissions(guild.permissions)) {
    throw new Error('Discord bot needs View Channels, Manage Channels, and Manage Webhooks permissions');
  }
  return guild;
}

function planInfrastructure(existingChannels = []) {
  const legacyCategory = existingChannels.find(channel => channel.type === 4 && channel.name === LEGACY_CATEGORY_NAME);
  const categories = Object.entries(DISCORD_CATEGORIES).map(([key, config], index) => {
    const existing = existingChannels.find(channel => channel.type === 4 && channel.name === config.name);
    const migratable = index === 0 && !existing ? legacyCategory : null;
    return {
      key,
      name: config.name,
      description: config.description,
      action: existing ? 'reuse' : (migratable ? 'rename' : 'create'),
      categoryId: existing?.id || migratable?.id || null,
    };
  });
  const channels = Object.entries(DISCORD_CHANNELS).map(([key, config]) => {
    const existing = existingChannels.find(channel => channel.type === 0 && channel.name === config.name);
    const category = categories.find(item => item.key === config.category);
    const correctlyPlaced = existing && category.categoryId && existing.parent_id === category.categoryId;
    return {
      key,
      name: config.name,
      description: config.description,
      category: config.category,
      action: !existing ? 'create' : (correctlyPlaced ? 'reuse' : 'move'),
      channelId: existing?.id || null,
    };
  });
  return { categories, channels };
}

function loadExistingWebhookMap(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function saveWebhookMap(file, webhooks) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(webhooks, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

async function provisionDiscordInfrastructure(options = {}, config = {}) {
  const token = config.token || process.env.DISCORD_BOT_TOKEN;
  const guildId = config.guildId || process.env.DISCORD_GUILD_ID;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is required');
  if (!/^[0-9]{15,22}$/.test(String(guildId || ''))) throw new Error('Valid DISCORD_GUILD_ID is required');

  const guild = await getInstalledGuild(guildId, { ...config, token });
  const existingChannels = await discordRequest(`/guilds/${guildId}/channels`, {}, { ...config, token });
  const plan = planInfrastructure(existingChannels);
  if (!options.apply) {
    return { applied: false, guildName: guild.name, plan, outputFile: options.outputFile || DEFAULT_OUTPUT_FILE };
  }

  const categoryIds = {};
  let createdCategories = 0;
  let renamedCategories = 0;
  for (const item of plan.categories) {
    let categoryId = item.categoryId;
    if (item.action === 'rename') {
      await discordRequest(`/channels/${categoryId}`, {
        method: 'PATCH',
        reason: 'Economic Agent category structure migration',
        body: { name: item.name },
      }, { ...config, token });
      renamedCategories += 1;
    } else if (!categoryId) {
      const category = await discordRequest(`/guilds/${guildId}/channels`, {
        method: 'POST',
        reason: 'Economic Agent report infrastructure provisioning',
        body: { name: item.name, type: 4 },
      }, { ...config, token });
      categoryId = category.id;
      createdCategories += 1;
    }
    categoryIds[item.key] = categoryId;
  }

  const webhookMap = loadExistingWebhookMap(options.outputFile || DEFAULT_OUTPUT_FILE);
  let createdChannels = 0;
  let movedChannels = 0;
  let createdWebhooks = 0;
  for (const item of plan.channels) {
    let channelId = item.channelId;
    if (!channelId) {
      const channel = await discordRequest(`/guilds/${guildId}/channels`, {
        method: 'POST',
        reason: 'Economic Agent report channel provisioning',
        body: {
          name: item.name,
          type: 0,
          parent_id: categoryIds[item.category],
          topic: item.description,
        },
      }, { ...config, token });
      channelId = channel.id;
      createdChannels += 1;
    } else if (item.action === 'move') {
      await discordRequest(`/channels/${channelId}`, {
        method: 'PATCH',
        reason: 'Economic Agent channel structure alignment',
        body: { parent_id: categoryIds[item.category], topic: item.description },
      }, { ...config, token });
      movedChannels += 1;
    }

    const existingWebhooks = await discordRequest(`/channels/${channelId}/webhooks`, {}, { ...config, token });
    let webhook = existingWebhooks.find(candidate => candidate.name === WEBHOOK_NAME && candidate.token);
    if (!webhook) {
      webhook = await discordRequest(`/channels/${channelId}/webhooks`, {
        method: 'POST',
        reason: 'Economic Agent report webhook provisioning',
        body: { name: WEBHOOK_NAME },
      }, { ...config, token });
      createdWebhooks += 1;
    }
    if (!webhook.id || !webhook.token) throw new Error(`Discord webhook token unavailable for channel: ${item.key}`);
    webhookMap[item.key] = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
  }
  saveWebhookMap(options.outputFile || DEFAULT_OUTPUT_FILE, webhookMap);

  return {
    applied: true,
    guildName: guild.name,
    createdCategories,
    renamedCategories,
    createdChannels,
    movedChannels,
    reusedChannels: plan.channels.length - createdChannels - movedChannels,
    createdWebhooks,
    reusedWebhooks: plan.channels.length - createdWebhooks,
    outputFile: options.outputFile || DEFAULT_OUTPUT_FILE,
  };
}

function formatPlan(result) {
  if (result.applied) {
    return [
      `[Discord] ${result.guildName} 인프라 적용 완료`,
      `- 카테고리 생성/이름변경: ${result.createdCategories}/${result.renamedCategories}`,
      `- 채널 생성/이동/재사용: ${result.createdChannels}/${result.movedChannels}/${result.reusedChannels}`,
      `- Webhook 생성/재사용: ${result.createdWebhooks}/${result.reusedWebhooks}`,
      `- 비밀 설정 파일: ${result.outputFile}`,
    ].join('\n');
  }
  return [
    `[Discord] ${result.guildName} dry-run`,
    ...result.plan.categories.map(item => `- [${item.name}]: ${item.action}`),
    ...result.plan.channels.map(item => `- #${item.name} → ${DISCORD_CATEGORIES[item.category].name}: ${item.action}`),
    '- 실제 생성하려면 --apply를 사용하세요.',
  ].join('\n');
}

async function main() {
  const options = parseArgs();
  const result = await provisionDiscordInfrastructure(options);
  console.log(formatPlan(result));
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[Discord] ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  LEGACY_CATEGORY_NAME,
  WEBHOOK_NAME,
  DEFAULT_OUTPUT_FILE,
  parseArgs,
  hasProvisionPermissions,
  planInfrastructure,
  loadExistingWebhookMap,
  saveWebhookMap,
  provisionDiscordInfrastructure,
  formatPlan,
  discordRequest,
};
