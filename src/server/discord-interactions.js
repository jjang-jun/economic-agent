const crypto = require('crypto');
const { routeDiscordPendingComponent, routeDiscordReadOnlyCommand } = require('../agent/agent-router');
const { discordInteractionToAgentText } = require('../config/discord-commands');
const { authorizeDiscordContext, getDiscordAccessPolicy } = require('../config/discord-access');
const { reportHtmlToDiscordMarkdown } = require('../notify/discord');
const { mentionActionsEnabled } = require('../agent/discord-mention-router');

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const INTERACTION_PING = 1;
const INTERACTION_APPLICATION_COMMAND = 2;
const INTERACTION_MESSAGE_COMPONENT = 3;
const RESPONSE_PONG = 1;
const RESPONSE_CHANNEL_MESSAGE = 4;
const RESPONSE_DEFERRED_CHANNEL_MESSAGE = 5;
const MESSAGE_FLAG_EPHEMERAL = 1 << 6;
const DEFAULT_SIGNATURE_MAX_AGE_SECONDS = 300;
const DEFAULT_ACK_TIMEOUT_MS = 2_500;
const DEFAULT_UPDATE_TIMEOUT_MS = 10_000;
const MAX_DISCORD_CONTENT_LENGTH = 2_000;

function getInteractionUserId(interaction = {}) {
  return String(interaction.member?.user?.id || interaction.user?.id || '');
}

function authorizeDiscordInteraction(interaction, env = process.env) {
  return authorizeDiscordContext({
    guildId: interaction.guild_id,
    channelId: interaction.channel_id,
    userId: getInteractionUserId(interaction),
  }, env);
}

function getHeader(headers = {}, name) {
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const key = Object.keys(headers).find(item => item.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? value[0] : String(value || '');
}

function verifyDiscordSignature(headers, rawBody, options = {}) {
  const env = options.env || process.env;
  const publicKeyHex = String(env.DISCORD_PUBLIC_KEY || '').trim();
  const signatureHex = getHeader(headers, 'x-signature-ed25519').trim();
  const timestamp = getHeader(headers, 'x-signature-timestamp').trim();
  if (!/^[a-f0-9]{64}$/i.test(publicKeyHex)) {
    return { valid: false, configurationError: true, reason: 'DISCORD_PUBLIC_KEY is not configured correctly' };
  }
  if (!/^[a-f0-9]{128}$/i.test(signatureHex) || !/^\d+$/.test(timestamp)) {
    return { valid: false, reason: 'invalid Discord signature headers' };
  }

  const maxAgeSeconds = Number(env.DISCORD_SIGNATURE_MAX_AGE_SECONDS || DEFAULT_SIGNATURE_MAX_AGE_SECONDS);
  const nowMs = options.now instanceof Date ? options.now.getTime() : Number(options.now || Date.now());
  const ageSeconds = Math.abs(nowMs / 1_000 - Number(timestamp));
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0 || ageSeconds > maxAgeSeconds) {
    return { valid: false, reason: 'stale Discord interaction' };
  }

  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    const valid = crypto.verify(
      null,
      Buffer.from(`${timestamp}${rawBody}`, 'utf8'),
      publicKey,
      Buffer.from(signatureHex, 'hex'),
    );
    return { valid, reason: valid ? '' : 'invalid Discord request signature' };
  } catch {
    return { valid: false, reason: 'invalid Discord request signature' };
  }
}

function clipDiscordContent(content, maxLength = MAX_DISCORD_CONTENT_LENGTH) {
  const text = String(content || '').trim() || '조회 결과가 없습니다.';
  if (text.length <= maxLength) return text;
  const suffix = '\n\n… 전체 내용은 Discord 리포트 채널 또는 로컬 대시보드에서 확인하세요.';
  return `${text.slice(0, Math.max(0, maxLength - suffix.length)).trimEnd()}${suffix}`;
}

function interactionMessage(content) {
  return {
    type: RESPONSE_CHANNEL_MESSAGE,
    data: {
      content: clipDiscordContent(content),
      flags: MESSAGE_FLAG_EPHEMERAL,
      allowed_mentions: { parse: [] },
    },
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function readDiscordResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function deferDiscordInteraction(interaction, fetcher = fetch, apiBase = DISCORD_API_BASE, timeoutMs = DEFAULT_ACK_TIMEOUT_MS) {
  const response = await fetcher(
    `${apiBase}/interactions/${encodeURIComponent(interaction.id)}/${encodeURIComponent(interaction.token)}/callback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        type: RESPONSE_DEFERRED_CHANNEL_MESSAGE,
        data: { flags: MESSAGE_FLAG_EPHEMERAL },
      }),
    },
  );
  if (!response.ok) {
    const detail = await readDiscordResponse(response);
    throw new Error(`Discord defer failed (${response.status}): ${detail.message || 'unknown error'}`);
  }
}

async function editDiscordOriginalResponse(
  interaction,
  content,
  fetcher = fetch,
  apiBase = DISCORD_API_BASE,
  timeoutMs = DEFAULT_UPDATE_TIMEOUT_MS,
) {
  const applicationId = interaction.application_id;
  const response = await fetcher(
    `${apiBase}/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(interaction.token)}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        content: clipDiscordContent(reportHtmlToDiscordMarkdown(content)),
        allowed_mentions: { parse: [] },
      }),
    },
  );
  if (!response.ok) {
    const detail = await readDiscordResponse(response);
    throw new Error(`Discord response update failed (${response.status}): ${detail.message || 'unknown error'}`);
  }
}

async function removeDiscordSourceComponents(
  interaction,
  env = process.env,
  fetcher = fetch,
  apiBase = DISCORD_API_BASE,
  timeoutMs = DEFAULT_UPDATE_TIMEOUT_MS,
) {
  const token = String(env.DISCORD_BOT_TOKEN || '');
  const channelId = String(interaction.channel_id || '');
  const messageId = String(interaction.message?.id || '');
  if (!token || !channelId || !messageId) return { updated: false };
  const response = await fetcher(
    `${apiBase}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ components: [] }),
    },
  );
  if (!response.ok) {
    const detail = await readDiscordResponse(response);
    throw new Error(`Discord component cleanup failed (${response.status}): ${detail.message || 'unknown error'}`);
  }
  return { updated: true };
}

async function handleDiscordInteraction(req, res, rawBody, options = {}) {
  const env = options.env || process.env;
  const verification = verifyDiscordSignature(req.headers, rawBody, {
    env,
    now: options.now,
  });
  if (!verification.valid) {
    const status = verification.configurationError ? 500 : 401;
    sendJson(res, status, { ok: false, error: verification.reason });
    return;
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody || '{}');
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid json' });
    return;
  }

  if (interaction.type === INTERACTION_PING) {
    sendJson(res, 200, { type: RESPONSE_PONG });
    return;
  }
  if (![INTERACTION_APPLICATION_COMMAND, INTERACTION_MESSAGE_COMPONENT].includes(interaction.type)) {
    sendJson(res, 200, interactionMessage('지원하지 않는 Discord Interaction입니다.'));
    return;
  }

  const authorization = authorizeDiscordInteraction(interaction, env);
  if (!authorization.allowed) {
    sendJson(res, 200, interactionMessage(authorization.reason));
    return;
  }
  if (interaction.type === INTERACTION_MESSAGE_COMPONENT) {
    const customId = String(interaction.data?.custom_id || '');
    if (!mentionActionsEnabled(env)) {
      sendJson(res, 200, interactionMessage('Discord 자연어 거래 승인이 비활성 상태입니다.'));
      return;
    }
    if (!/^(?:confirm|cancel):[0-9a-f-]{36}:[0-9a-f]{16}$/i.test(customId)) {
      sendJson(res, 200, interactionMessage('지원하지 않는 승인 버튼입니다.'));
      return;
    }
  }
  if (!discordInteractionToAgentText(interaction)) {
    if (interaction.type === INTERACTION_APPLICATION_COMMAND) {
      sendJson(res, 200, interactionMessage('지원하지 않는 명령입니다.'));
      return;
    }
  }

  const fetcher = options.fetcher || fetch;
  const router = interaction.type === INTERACTION_MESSAGE_COMPONENT
    ? (options.componentRouter || routeDiscordPendingComponent)
    : (options.router || routeDiscordReadOnlyCommand);
  const apiBase = options.apiBase || DISCORD_API_BASE;
  const ackTimeoutMs = Math.max(1, Number(env.DISCORD_INTERACTION_ACK_TIMEOUT_MS || DEFAULT_ACK_TIMEOUT_MS));
  const updateTimeoutMs = Math.max(1, Number(env.DISCORD_REQUEST_TIMEOUT_MS || DEFAULT_UPDATE_TIMEOUT_MS));
  try {
    await deferDiscordInteraction(interaction, fetcher, apiBase, ackTimeoutMs);
  } catch (err) {
    console.error(`[DiscordInteraction] 응답 접수 실패: ${err.message}`);
    sendJson(res, 502, { ok: false, error: 'failed to acknowledge interaction' });
    return;
  }

  let content;
  let routedSuccessfully = false;
  try {
    const result = await router(interaction);
    content = result.response;
    routedSuccessfully = true;
  } catch (err) {
    console.error(`[DiscordInteraction] 명령 처리 실패: ${err.message}`);
    content = '조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }

  try {
    await editDiscordOriginalResponse(interaction, content, fetcher, apiBase, updateTimeoutMs);
  } catch (err) {
    console.error(`[DiscordInteraction] 결과 전송 실패: ${err.message}`);
  }
  if (interaction.type === INTERACTION_MESSAGE_COMPONENT && routedSuccessfully) {
    const componentCleaner = options.componentCleaner || removeDiscordSourceComponents;
    try {
      await componentCleaner(interaction, env, fetcher, apiBase, updateTimeoutMs);
    } catch (err) {
      console.error(`[DiscordInteraction] 승인 버튼 정리 실패: ${err.message}`);
    }
  }
  res.writeHead(202);
  res.end();
}

module.exports = {
  authorizeDiscordInteraction,
  clipDiscordContent,
  deferDiscordInteraction,
  editDiscordOriginalResponse,
  getDiscordAccessPolicy,
  handleDiscordInteraction,
  interactionMessage,
  removeDiscordSourceComponents,
  verifyDiscordSignature,
};
