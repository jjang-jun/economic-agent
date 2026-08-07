const { authorizeDiscordContext, getDiscordAccessPolicy } = require('../src/config/discord-access');
const { routeDiscordMention } = require('../src/agent/discord-mention-router');
const { reportHtmlToDiscordMarkdown } = require('../src/notify/discord');
const { handleGatewayDiscordInteraction } = require('../src/server/discord-interactions');
const { PcWorkerScheduler } = require('../src/worker/pc-scheduler');

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const GATEWAY_VERSION = 10;
const GATEWAY_INTENTS = (1 << 0) | (1 << 9) | (1 << 15); // GUILDS + GUILD_MESSAGES + MESSAGE_CONTENT
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const SUPPORTED_HOST_PLATFORMS = Object.freeze({
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows',
});

function inspectRuntimeCompatibility(options = {}) {
  const platform = options.platform || process.platform;
  const nodeVersion = options.nodeVersion || process.versions.node;
  const nodeMajor = Number.parseInt(String(nodeVersion).split('.')[0], 10);
  const fetcher = Object.hasOwn(options, 'fetcher') ? options.fetcher : globalThis.fetch;
  const WebSocketClass = Object.hasOwn(options, 'WebSocketClass')
    ? options.WebSocketClass
    : globalThis.WebSocket;
  const abortSignalTimeout = Object.hasOwn(options, 'abortSignalTimeout')
    ? options.abortSignalTimeout
    : globalThis.AbortSignal?.timeout;
  const checks = {
    supportedHost: Boolean(SUPPORTED_HOST_PLATFORMS[platform]),
    node22OrNewer: Number.isFinite(nodeMajor) && nodeMajor >= 22,
    fetch: typeof fetcher === 'function',
    webSocket: typeof WebSocketClass === 'function',
    abortSignalTimeout: typeof abortSignalTimeout === 'function',
  };
  return {
    ok: Object.values(checks).every(Boolean),
    platform,
    platformName: SUPPORTED_HOST_PLATFORMS[platform] || platform,
    nodeVersion,
    checks,
  };
}

function formatRuntimeCompatibility(result) {
  const status = result.ok ? '지원됨' : '지원되지 않음';
  const checks = Object.entries(result.checks)
    .map(([name, passed]) => `${name}=${passed ? 'ok' : 'missing'}`)
    .join(', ');
  return `[DiscordAgent] runtime ${status}: ${result.platformName} (${result.platform}), Node ${result.nodeVersion}; ${checks}`;
}

function assertRuntimeCompatibility(options = {}) {
  const result = inspectRuntimeCompatibility(options);
  if (!result.ok) {
    throw new Error(`${formatRuntimeCompatibility(result)}. Windows/macOS/Linux에서 Node.js 22 이상을 사용하세요.`);
  }
  return result;
}

function requireGatewayConfig(env = process.env) {
  const token = String(env.DISCORD_BOT_TOKEN || '').trim();
  if (!token) throw new Error('DISCORD_BOT_TOKEN is required');
  const policy = getDiscordAccessPolicy(env);
  if (!policy.guildId) throw new Error('DISCORD_GUILD_ID is required');
  if (policy.allowedUserIds.length === 0) throw new Error('DISCORD_ALLOWED_USER_IDS is required');
  if (policy.allowedChannelIds.length === 0) {
    throw new Error('DISCORD_ALLOWED_CHANNEL_IDS is required for mention messages');
  }
  return { token, policy };
}

function configuredAgentRoleIds(env = process.env) {
  return String(env.DISCORD_AGENT_ROLE_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function messageMentionsBot(message = {}, botUserId = '', env = process.env) {
  const directMention = Boolean(
    botUserId && (message.mentions || []).some(user => String(user.id) === String(botUserId)),
  );
  const allowedRoleIds = configuredAgentRoleIds(env);
  const roleMention = (message.mention_roles || [])
    .some(roleId => allowedRoleIds.includes(String(roleId)));
  return directMention || roleMention;
}

function authorizeMentionMessage(message = {}, botUserId = '', env = process.env) {
  if (message.author?.bot || !messageMentionsBot(message, botUserId, env)) {
    return { allowed: false, ignored: true, reason: 'not an allowed human mention' };
  }
  return authorizeDiscordContext({
    guildId: message.guild_id,
    channelId: message.channel_id,
    userId: message.author?.id,
  }, env, { requireChannelAllowlist: true });
}

function discordMessagePayload(message, result) {
  const markdown = reportHtmlToDiscordMarkdown(result.response || '처리 결과가 없습니다.');
  return {
    content: markdown.slice(0, 2_000),
    allowed_mentions: { parse: [], replied_user: false },
    message_reference: {
      message_id: String(message.id),
      fail_if_not_exists: false,
    },
    ...(result.components?.length ? { components: result.components } : {}),
  };
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function discordApiRequest(path, options = {}, config = {}) {
  const env = config.env || process.env;
  const fetcher = config.fetcher || globalThis.fetch;
  const token = config.token || env.DISCORD_BOT_TOKEN;
  const apiBase = config.apiBase || DISCORD_API_BASE;
  const timeoutMs = Math.max(1, Number(env.DISCORD_REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS));
  const response = await fetcher(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await readResponse(response);
  if (!response.ok) {
    const detail = typeof body === 'object' ? body?.message : body;
    const error = new Error(`Discord API failed (${response.status}): ${detail || 'unknown error'}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function sendMentionResponse(message, result, config = {}) {
  return discordApiRequest(`/channels/${encodeURIComponent(message.channel_id)}/messages`, {
    method: 'POST',
    body: JSON.stringify(discordMessagePayload(message, result)),
  }, config);
}

async function sendTypingIndicator(message, config = {}) {
  return discordApiRequest(`/channels/${encodeURIComponent(message.channel_id)}/typing`, {
    method: 'POST',
  }, config);
}

function startTypingLoop(message, config = {}) {
  const notify = config.typingNotifier || sendTypingIndicator;
  const send = () => Promise.resolve(notify(message, config))
    .catch(err => console.warn(`[DiscordAgent] 타이핑 표시 실패: ${err.message}`));
  send();
  const timer = setInterval(send, 7_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function handleGatewayMessage(message, options = {}) {
  const env = options.env || process.env;
  const authorization = authorizeMentionMessage(message, options.botUserId, env);
  if (!authorization.allowed) return { handled: false, reason: authorization.reason };
  const router = options.router || routeDiscordMention;
  const sender = options.sender || sendMentionResponse;
  const startedAt = Date.now();
  const stopTyping = options.sender && !options.typingNotifier
    ? () => {}
    : startTypingLoop(message, options);
  try {
    const result = await router(message, { env });
    await sender(message, result, options);
    const elapsedMs = Date.now() - startedAt;
    console.log(`[DiscordAgent] 멘션 처리 완료: intent=${result.intent}, elapsedMs=${elapsedMs}`);
    return { handled: true, intent: result.intent, elapsedMs };
  } finally {
    stopTyping();
  }
}

class DiscordGatewayWorker {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fetcher = options.fetcher || globalThis.fetch;
    this.WebSocketClass = options.WebSocketClass || globalThis.WebSocket;
    this.token = options.token || '';
    this.gatewayUrl = '';
    this.resumeGatewayUrl = '';
    this.sessionId = '';
    this.sequence = null;
    this.botUserId = '';
    this.socket = null;
    this.heartbeatTimer = null;
    this.heartbeatStartTimer = null;
    this.reconnectTimer = null;
    this.heartbeatAcknowledged = true;
    this.stopped = false;
    this.reconnectAttempt = 0;
    this.scheduler = options.scheduler || new PcWorkerScheduler({ env: this.env });
    this.onFatalClose = options.onFatalClose || (() => { process.exitCode = 1; });
    this.fatalClosePromise = null;
    this.reconnectHandledSockets = new WeakSet();
  }

  async start() {
    assertRuntimeCompatibility({
      platform: process.platform,
      nodeVersion: process.versions.node,
      fetcher: this.fetcher,
      WebSocketClass: this.WebSocketClass,
      abortSignalTimeout: globalThis.AbortSignal?.timeout,
    });
    const config = requireGatewayConfig(this.env);
    this.token = this.token || config.token;
    await this.scheduler.start();
    try {
      await this.ensureConnected();
    } catch (err) {
      if ([401, 403].includes(Number(err.status))) {
        await this.stop();
        throw err;
      }
      console.error(`[DiscordAgent] 초기 Gateway 연결 지연: ${err.message}`);
      this.handleClose({ code: 0 });
    }
  }

  async ensureConnected() {
    if (!this.gatewayUrl) {
      const gateway = await discordApiRequest('/gateway/bot', { method: 'GET' }, {
        env: this.env,
        fetcher: this.fetcher,
        token: this.token,
      });
      this.gatewayUrl = gateway.url;
    }
    await this.connect();
  }

  async connect() {
    if (this.stopped) return;
    const base = this.resumeGatewayUrl || this.gatewayUrl;
    if (!base) throw new Error('Discord Gateway URL is unavailable');
    const separator = base.includes('?') ? '&' : '?';
    const url = `${base}${separator}v=${GATEWAY_VERSION}&encoding=json`;
    const socket = new this.WebSocketClass(url);
    this.socket = socket;
    socket.addEventListener('message', event => this.handlePayload(event.data));
    socket.addEventListener('close', event => this.handleClose(event, socket));
    socket.addEventListener('error', event => {
      if (this.socket !== socket || this.reconnectHandledSockets.has(socket)) return;
      console.error(`[DiscordAgent] Gateway 오류: ${event.message || 'websocket error'}`);
      // Mark and schedule the reconnect before close(). Some WebSocket
      // implementations synchronously emit another error while closing a
      // connection that never reached OPEN, which otherwise recurses here.
      this.handleClose({ code: 0 }, socket);
      try {
        socket.close(4000, 'gateway websocket error');
      } catch {
        // Some WebSocket implementations reject close() before OPEN.
      }
    });
  }

  send(payload) {
    if (this.socket?.readyState !== this.WebSocketClass.OPEN) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  identifyOrResume() {
    if (this.sessionId && this.sequence !== null) {
      this.send({
        op: 6,
        d: { token: this.token, session_id: this.sessionId, seq: this.sequence },
      });
      return;
    }
    this.send({
      op: 2,
      d: {
        token: this.token,
        intents: GATEWAY_INTENTS,
        properties: {
          os: process.platform,
          browser: 'economic-agent',
          device: 'economic-agent',
        },
      },
    });
  }

  startHeartbeat(intervalMs) {
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.heartbeatStartTimer);
    this.heartbeatAcknowledged = true;
    const heartbeat = () => {
      if (!this.heartbeatAcknowledged) {
        this.socket?.close(4000, 'heartbeat not acknowledged');
        return;
      }
      this.heartbeatAcknowledged = false;
      this.send({ op: 1, d: this.sequence });
    };
    this.heartbeatStartTimer = setTimeout(heartbeat, Math.floor(Math.random() * intervalMs));
    this.heartbeatTimer = setInterval(heartbeat, intervalMs);
  }

  handlePayload(raw) {
    let payload;
    try {
      payload = JSON.parse(String(raw));
    } catch {
      console.error('[DiscordAgent] Gateway payload JSON 파싱 실패');
      return;
    }
    if (payload.s !== null && payload.s !== undefined) this.sequence = payload.s;
    if (payload.op === 10) {
      this.startHeartbeat(payload.d.heartbeat_interval);
      this.identifyOrResume();
      return;
    }
    if (payload.op === 11) {
      this.heartbeatAcknowledged = true;
      return;
    }
    if (payload.op === 1) {
      this.heartbeatAcknowledged = false;
      this.send({ op: 1, d: this.sequence });
      return;
    }
    if (payload.op === 7) {
      this.socket?.close(4000, 'server requested reconnect');
      return;
    }
    if (payload.op === 9) {
      if (payload.d === false) {
        this.sessionId = '';
        this.sequence = null;
        this.resumeGatewayUrl = '';
      }
      this.socket?.close(4000, 'invalid session');
      return;
    }
    if (payload.op !== 0) return;
    if (payload.t === 'READY') {
      this.sessionId = payload.d.session_id;
      this.resumeGatewayUrl = payload.d.resume_gateway_url || this.gatewayUrl;
      this.botUserId = payload.d.user?.id || '';
      this.reconnectAttempt = 0;
      this.scheduler.setGatewayConnected(true);
      this.scheduler.heartbeat().catch(err => console.error(`[DiscordAgent] heartbeat 갱신 실패: ${err.message}`));
      console.log(`[DiscordAgent] Gateway 연결 완료: bot=${this.botUserId}`);
      return;
    }
    if (payload.t === 'RESUMED') {
      this.reconnectAttempt = 0;
      this.scheduler.setGatewayConnected(true);
      console.log('[DiscordAgent] Gateway 세션 재개 완료');
      return;
    }
    if (payload.t === 'MESSAGE_CREATE') {
      handleGatewayMessage(payload.d, {
        env: this.env,
        botUserId: this.botUserId,
        fetcher: this.fetcher,
        token: this.token,
      }).catch(err => console.error(`[DiscordAgent] 멘션 처리 실패: ${err.message}`));
      return;
    }
    if (payload.t === 'INTERACTION_CREATE') {
      handleGatewayDiscordInteraction(payload.d, {
        env: this.env,
        fetcher: this.fetcher,
      }).catch(err => console.error(`[DiscordAgent] Interaction 처리 실패: ${err.message}`));
    }
  }

  handleClose(event = {}, socket = this.socket) {
    if (socket && this.socket !== socket) return;
    if (socket && this.reconnectHandledSockets.has(socket)) return;
    if (socket) this.reconnectHandledSockets.add(socket);
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.heartbeatStartTimer);
    this.heartbeatTimer = null;
    this.heartbeatStartTimer = null;
    this.socket = null;
    this.scheduler.setGatewayConnected(false);
    if (this.stopped) return;
    if ([4004, 4010, 4011, 4012, 4013, 4014].includes(Number(event.code))) {
      console.error(`[DiscordAgent] 재연결 불가 close code ${event.code}. Bot token과 intents 설정을 확인하세요.`);
      this.stopped = true;
      this.fatalClosePromise = this.scheduler.stop()
        .catch(err => console.error(`[DiscordAgent] 치명적 종료 처리 실패: ${err.message}`))
        .finally(() => this.onFatalClose(Number(event.code)));
      return;
    }
    this.reconnectAttempt += 1;
    const delayMs = Math.min(30_000, 1_000 * (2 ** Math.min(this.reconnectAttempt - 1, 5)));
    console.warn(`[DiscordAgent] Gateway 연결 종료(${event.code || 'unknown'}), ${delayMs}ms 후 재연결`);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.ensureConnected().catch(err => {
      console.error(`[DiscordAgent] 재연결 실패: ${err.message}`);
      this.handleClose({ code: 0 });
    }), delayMs);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.heartbeatStartTimer);
    clearTimeout(this.reconnectTimer);
    this.socket?.close(1000, 'worker stopped');
    await this.scheduler.stop();
  }
}

async function main() {
  if (process.argv.includes('--runtime-check')) {
    const result = inspectRuntimeCompatibility();
    console.log(formatRuntimeCompatibility(result));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const worker = new DiscordGatewayWorker();
  await worker.start();
  const stop = () => worker.stop().catch(err => {
    console.error(`[DiscordAgent] 종료 처리 실패: ${err.message}`);
  });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('SIGHUP', stop);
  if (process.platform === 'win32') process.once('SIGBREAK', stop);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[DiscordAgent] 시작 실패: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DiscordGatewayWorker,
  assertRuntimeCompatibility,
  authorizeMentionMessage,
  configuredAgentRoleIds,
  discordApiRequest,
  discordMessagePayload,
  formatRuntimeCompatibility,
  handleGatewayMessage,
  inspectRuntimeCompatibility,
  messageMentionsBot,
  requireGatewayConfig,
  sendMentionResponse,
  sendTypingIndicator,
  startTypingLoop,
};
