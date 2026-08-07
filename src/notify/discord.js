const fs = require('fs');
const path = require('path');
const { DISCORD_CHANNELS, discordWebhookEnvName } = require('../config/discord-channels');

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MESSAGE_LIMIT = 3800;
const MAX_EMBED_DESCRIPTION_LENGTH = 4096;
const MAX_EMBED_FIELD_VALUE_LENGTH = 1024;
const DEFAULT_WEBHOOK_FILE = path.join(__dirname, '..', '..', 'data', 'discord-webhooks.json');
const DISCORD_CHANNEL_THEMES = {
  urgent: { title: '긴급 알림', emoji: '🚨', color: 0xED4245 },
  action: { title: '오늘의 행동', emoji: '🎯', color: 0xF0B232 },
  briefing: { title: '시장 브리핑', emoji: '🗞️', color: 0x5865F2 },
  portfolio: { title: '포트폴리오', emoji: '💼', color: 0x57F287 },
  policy_tax: { title: '정책 · 세금', emoji: '🏛️', color: 0xF1C40F },
  policy_real_estate: { title: '정책 · 부동산', emoji: '🏠', color: 0x9B59B6 },
  pre_news: { title: '기사 전 선행 신호', emoji: '📡', color: 0x1ABC9C },
  performance: { title: '성과 리뷰', emoji: '📈', color: 0x2ECC71 },
  ops: { title: '시스템 점검', emoji: '🛠️', color: 0x95A5A6 },
};
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
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function reportHtmlToDiscordMarkdown(value = '') {
  const markdown = decodeHtmlEntities(String(value)
    .replace(/<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `[${label}](${href})`)
    .replace(/<\/?(?:b|strong)>/gi, '**')
    .replace(/<\/?(?:i|em)>/gi, '*')
    .replace(/<\/?u>/gi, '__')
    .replace(/<\/?(?:s|strike|del)>/gi, '~~')
    .replace(/<code>([\s\S]*?)<\/code>/gi, (_, code) => `\`${code}\``)
    .replace(/<pre>([\s\S]*?)<\/pre>/gi, (_, code) => `\`\`\`\n${code}\n\`\`\``)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ''));
  return enhanceDiscordMarkdown(markdown
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim());
}

function enhanceDiscordMarkdown(value = '') {
  let inCodeFence = false;
  return String(value).split('\n').map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      return line;
    }
    if (inCodeFence) return line;
    if (/^[━─—-]{4,}$/.test(trimmed)) return '';
    if (trimmed.startsWith('▸ ')) return `- ${trimmed.slice(2)}`;

    const emojiHeading = trimmed.match(/^([^\w\s*]{1,3})\s*\*\*(.+)\*\*$/u);
    if (emojiHeading) return `## ${emojiHeading[1]} ${emojiHeading[2]}`;
    const numberedHeading = trimmed.match(/^\*\*((?:\d+\.|Step\s+\d+\b).+)\*\*$/i);
    if (numberedHeading) return `### ${numberedHeading[1]}`;
    const heading = trimmed.match(/^\*\*([^*]{2,80})\*\*$/);
    if (heading) return `## ${heading[1]}`;
    const caveat = trimmed.match(/^\*([^*].+)\*$/);
    if (caveat) return `> *${caveat[1]}*`;
    return line;
  }).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function discordChannelTheme(channel) {
  const key = String(channel || 'ops');
  return DISCORD_CHANNEL_THEMES[key] || {
    title: DISCORD_CHANNELS[key]?.name || 'Economic Agent',
    emoji: '📌',
    color: 0x5865F2,
  };
}

const EMBED_FIELD_LABELS = new Set([
  '상태', '워크플로우', '작업', '브랜치', '커밋', '실행자',
  '점검 방식', 'Webhook 설정', '수신 채널', '배포 커밋', '점검 시각',
]);

function clipDiscord(value, maxLength) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text;
}

function prepareDiscordPresentation(markdown, options = {}) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  let title = options.title ? String(options.title) : '';
  const firstContentIndex = lines.findIndex(line => line.trim());
  if (!title && firstContentIndex >= 0) {
    const heading = lines[firstContentIndex].trim().match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      title = heading[1];
      lines.splice(firstContentIndex, 1);
    }
  }

  const fields = [];
  const bodyLines = [];
  let inCodeFence = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) inCodeFence = !inCodeFence;
    const metadata = !inCodeFence
      ? line.trim().match(/^\*\*([^*]{1,40})\*\*\s{2}(.+)$/)
      : null;
    if (metadata && EMBED_FIELD_LABELS.has(metadata[1]) && fields.length < 12) {
      fields.push({
        name: metadata[1],
        value: clipDiscord(metadata[2], MAX_EMBED_FIELD_VALUE_LENGTH),
        inline: !['워크플로우', '작업'].includes(metadata[1]),
      });
    } else {
      bodyLines.push(line);
    }
  }

  return {
    title: clipDiscord(title, 256),
    description: bodyLines.join('\n').replace(/^\s+|\s+$/g, '').replace(/\n{3,}/g, '\n\n'),
    fields,
  };
}

function buildDiscordEmbed(markdown, options = {}) {
  const channel = String(options.channel || 'ops');
  const theme = discordChannelTheme(channel);
  const total = Math.max(1, Number(options.total || 1));
  const index = Math.max(0, Number(options.index || 0));
  const page = total > 1 ? ` · ${index + 1}/${total}` : '';
  const presentation = prepareDiscordPresentation(markdown, options);
  const baseTitle = presentation.title || `${theme.emoji} ${theme.title}`;
  const embed = {
    author: {
      name: `Economic Agent · #${DISCORD_CHANNELS[channel]?.name || channel}`,
    },
    title: `${baseTitle}${page}`.slice(0, 256),
    description: clipDiscord(presentation.description || '세부 내용 없음', MAX_EMBED_DESCRIPTION_LENGTH),
    color: theme.color,
    footer: {
      text: '자동 생성 리포트 · 원문과 최신 데이터를 함께 확인하세요',
    },
    timestamp: new Date(options.now || Date.now()).toISOString(),
  };
  const fields = options.fields || presentation.fields;
  if (fields?.length > 0) embed.fields = fields.slice(0, 25);
  if (options.url) embed.url = String(options.url);
  return embed;
}

function shouldUseEmbeds(options = {}) {
  if (options.useEmbeds !== undefined) return options.useEmbeds !== false;
  const configured = (options.env || process.env).DISCORD_USE_EMBEDS;
  return !configured || !['0', 'false', 'no', 'off'].includes(String(configured).toLowerCase());
}

function buildDiscordPayload(markdown, options = {}) {
  const common = {
    allowed_mentions: { parse: [] },
    ...(options.username ? { username: String(options.username).slice(0, 80) } : {}),
  };
  if (!shouldUseEmbeds(options)) {
    return { content: markdown, ...common };
  }
  return {
    embeds: [buildDiscordEmbed(markdown, options)],
    ...common,
  };
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

  const markdown = options.reportHtml === false
    ? enhanceDiscordMarkdown(String(text))
    : reportHtmlToDiscordMarkdown(text);
  const presentation = prepareDiscordPresentation(markdown, options);
  const chunks = splitDiscordMessage(
    presentation.description || '세부 내용 없음',
    options.maxLength || DEFAULT_MESSAGE_LIMIT
  );
  if (chunks.length === 0) return { delivered: false, channel, messageCount: 0 };

  for (let index = 0; index < chunks.length; index += 1) {
    const res = await fetchDiscord(webhookRequestUrl(resolved.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (https://github.com/economic-agent, 2.0)',
      },
      body: JSON.stringify(buildDiscordPayload(chunks[index], {
        ...options,
        channel,
        index,
        total: chunks.length,
        title: presentation.title,
        fields: index === 0 ? presentation.fields : [],
      })),
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
  DISCORD_CHANNEL_THEMES,
  DEFAULT_WEBHOOK_FILE,
  parseWebhookMap,
  isDiscordWebhookUrl,
  resolveDiscordWebhook,
  reportHtmlToDiscordMarkdown,
  enhanceDiscordMarkdown,
  prepareDiscordPresentation,
  discordChannelTheme,
  buildDiscordEmbed,
  shouldUseEmbeds,
  buildDiscordPayload,
  splitDiscordMessage,
  sendDiscordMessage,
  inspectDiscordConfiguration,
};
