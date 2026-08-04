const fs = require('fs');
const path = require('path');
const { DISCORD_CHANNELS, discordWebhookEnvName } = require('../config/discord-channels');

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MESSAGE_LIMIT = 1900;
const DEFAULT_WEBHOOK_FILE = path.join(__dirname, '..', '..', 'data', 'discord-webhooks.json');
const ALLOWED_WEBHOOK_HOSTS = new Set([
  'discord.com',
  'canary.discord.com',
  'ptb.discord.com',
  'discordapp.com',
]);

function parseWebhookMap(env = process.env) {
  const encoded = env.DISCORD_WEBHOOKS_JSON_BASE64;
  const raw = encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : env.DISCORD_WEBHOOKS_JSON;
  if (!raw) {
    const file = env.DISCORD_WEBHOOKS_FILE || (env === process.env ? DEFAULT_WEBHOOK_FILE : '');
    if (!file) return {};
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('object expected');
      return value;
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw new Error(`Discord webhook file parsing failed: ${err.message}`);
    }
  }
  try {
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new Error('object expected');
    }
    return value;
  } catch (err) {
    throw new Error(`Discord webhook map parsing failed: ${err.message}`);
  }
}

function isDiscordWebhookUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ALLOWED_WEBHOOK_HOSTS.has(url.hostname)
      && /^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

function resolveDiscordWebhook(channel, env = process.env) {
  const key = String(channel || 'ops');
  const direct = env[discordWebhookEnvName(key)];
  const mapped = parseWebhookMap(env)[key];
  const fallback = env.DISCORD_WEBHOOK_URL;
  const url = direct || mapped || fallback || '';
  if (!url) return { configured: false, channel: key, source: 'missing', url: '' };
  if (!isDiscordWebhookUrl(url)) {
    throw new Error(`Invalid Discord webhook URL configured for channel: ${key}`);
  }
  return {
    configured: true,
    channel: key,
    source: direct ? 'channel_env' : (mapped ? (env.DISCORD_WEBHOOKS_JSON_BASE64 || env.DISCORD_WEBHOOKS_JSON ? 'webhook_map' : 'local_file') : 'default'),
    url,
  };
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function telegramHtmlToDiscordMarkdown(value = '') {
  return decodeHtmlEntities(String(value)
    .replace(/<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `[${label}](${href})`)
    .replace(/<\/?b>/gi, '**')
    .replace(/<\/?(?:i|em)>/gi, '*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ''));
}

function splitDiscordMessage(value = '', maxLength = DEFAULT_MESSAGE_LIMIT) {
  const text = String(value).replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let current = '';
  const paragraphs = text.split(/\n{2,}/);
  const pushHardSplit = paragraph => {
    let remaining = paragraph;
    while (remaining.length > maxLength) {
      let cut = remaining.lastIndexOf('\n', maxLength);
      if (cut < Math.floor(maxLength * 0.5)) cut = remaining.lastIndexOf(' ', maxLength);
      if (cut < Math.floor(maxLength * 0.5)) cut = maxLength;
      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    return remaining;
  };

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = paragraph.length > maxLength ? pushHardSplit(paragraph) : paragraph;
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

function webhookRequestUrl(webhookUrl) {
  const url = new URL(webhookUrl);
  url.searchParams.set('wait', 'true');
  return url.toString();
}

async function fetchDiscord(url, options = {}, config = {}) {
  const fetcher = config.fetcher || fetch;
  const timeoutMs = Math.max(1, Number(config.timeoutMs || process.env.DISCORD_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  try {
    return await fetcher(url, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError') {
      throw new Error(`Discord request timed out after ${timeoutMs}ms`, { cause: err });
    }
    throw err;
  }
}

async function sendDiscordMessage(text, options = {}) {
  const channel = options.channel || 'ops';
  const resolved = options.webhookUrl
    ? { configured: true, channel, source: 'option', url: options.webhookUrl }
    : resolveDiscordWebhook(channel, options.env || process.env);
  if (resolved.configured && !isDiscordWebhookUrl(resolved.url)) {
    throw new Error(`Invalid Discord webhook URL configured for channel: ${channel}`);
  }
  if (!resolved.configured) {
    if (options.requireDelivery) {
      throw new Error(`Discord delivery is required but webhook is not configured for channel: ${channel}`);
    }
    console.warn(`[Discord] ${channel} webhook이 설정되지 않았습니다.`);
    return { delivered: false, channel, messageCount: 0 };
  }

  const markdown = options.telegramHtml === false
    ? String(text)
    : telegramHtmlToDiscordMarkdown(text);
  const chunks = splitDiscordMessage(markdown, options.maxLength || DEFAULT_MESSAGE_LIMIT);
  if (chunks.length === 0) return { delivered: false, channel, messageCount: 0 };

  for (let index = 0; index < chunks.length; index += 1) {
    const prefix = chunks.length > 1 ? `**${index + 1}/${chunks.length}**\n` : '';
    const res = await fetchDiscord(webhookRequestUrl(resolved.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (https://github.com/economic-agent, 2.0)',
      },
      body: JSON.stringify({
        content: `${prefix}${chunks[index]}`,
        allowed_mentions: { parse: [] },
        ...(options.username ? { username: String(options.username).slice(0, 80) } : {}),
      }),
    }, options);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord delivery failed for ${channel}: ${res.status} ${body.slice(0, 300)}`);
    }
  }

  return { delivered: true, channel, messageCount: chunks.length, source: resolved.source };
}

function inspectDiscordConfiguration(env = process.env) {
  return Object.entries(DISCORD_CHANNELS).map(([key, config]) => {
    try {
      const resolved = resolveDiscordWebhook(key, env);
      return {
        key,
        name: config.name,
        configured: resolved.configured,
        source: resolved.source,
        valid: true,
      };
    } catch (err) {
      return {
        key,
        name: config.name,
        configured: true,
        source: 'invalid',
        valid: false,
        error: err.message,
      };
    }
  });
}

module.exports = {
  DEFAULT_MESSAGE_LIMIT,
  DEFAULT_WEBHOOK_FILE,
  parseWebhookMap,
  isDiscordWebhookUrl,
  resolveDiscordWebhook,
  telegramHtmlToDiscordMarkdown,
  splitDiscordMessage,
  sendDiscordMessage,
  inspectDiscordConfiguration,
};
