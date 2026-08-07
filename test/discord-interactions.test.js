const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Readable } = require('node:stream');
const { requestHandler } = require('../src/server');
const {
  authorizeDiscordInteraction,
  clipDiscordContent,
  handleGatewayDiscordInteraction,
  handleDiscordInteraction,
  verifyDiscordSignature,
} = require('../src/server/discord-interactions');

function createKeyFixture() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  return {
    privateKey,
    publicKeyHex: publicKeyDer.subarray(-32).toString('hex'),
  };
}

function signRequest(privateKey, rawBody, timestamp) {
  return crypto.sign(null, Buffer.from(`${timestamp}${rawBody}`), privateKey).toString('hex');
}

function createRequest(privateKey, rawBody, timestamp) {
  return {
    headers: {
      'x-signature-timestamp': timestamp,
      'x-signature-ed25519': signRequest(privateKey, rawBody, timestamp),
    },
  };
}

function createResponseRecorder() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

function fetchResponse(status, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function buildCommand(overrides = {}) {
  return {
    id: '111111111111111111',
    application_id: '222222222222222222',
    token: 'interaction-token',
    type: 2,
    guild_id: '333333333333333333',
    channel_id: '444444444444444444',
    member: { user: { id: '555555555555555555' } },
    data: { name: 'portfolio' },
    ...overrides,
  };
}

async function withEnv(patch, fn) {
  const previous = Object.fromEntries(Object.keys(patch).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Discord request signature verifies the raw timestamp plus body and rejects stale requests', () => {
  const keys = createKeyFixture();
  const now = new Date('2026-08-04T12:00:00.000Z');
  const timestamp = String(Math.floor(now.getTime() / 1_000));
  const rawBody = JSON.stringify({ type: 1 });
  const request = createRequest(keys.privateKey, rawBody, timestamp);
  const env = { DISCORD_PUBLIC_KEY: keys.publicKeyHex };

  assert.equal(verifyDiscordSignature(request.headers, rawBody, { env, now }).valid, true);
  assert.equal(verifyDiscordSignature(request.headers, `${rawBody} `, { env, now }).valid, false);
  assert.match(verifyDiscordSignature(request.headers, rawBody, {
    env,
    now: new Date(now.getTime() + 301_000),
  }).reason, /stale/);
});

test('Discord access policy requires configured guild and explicit user allowlist', () => {
  const interaction = buildCommand();
  assert.equal(authorizeDiscordInteraction(interaction, {
    DISCORD_GUILD_ID: interaction.guild_id,
    DISCORD_ALLOWED_USER_IDS: interaction.member.user.id,
  }).allowed, true);
  assert.equal(authorizeDiscordInteraction(interaction, {
    DISCORD_GUILD_ID: interaction.guild_id,
  }).allowed, false);
  assert.equal(authorizeDiscordInteraction(interaction, {
    DISCORD_GUILD_ID: interaction.guild_id,
    DISCORD_ALLOWED_USER_IDS: '999999999999999999',
  }).allowed, false);
  assert.equal(authorizeDiscordInteraction(interaction, {
    DISCORD_GUILD_ID: interaction.guild_id,
    DISCORD_ALLOWED_USER_IDS: interaction.member.user.id,
    DISCORD_ALLOWED_CHANNEL_IDS: '999999999999999999',
  }).allowed, false);
});

test('Discord PING receives a signed PONG without requiring financial-data authorization', async () => {
  const keys = createKeyFixture();
  const now = new Date('2026-08-04T12:00:00.000Z');
  const timestamp = String(Math.floor(now.getTime() / 1_000));
  const rawBody = JSON.stringify({ type: 1 });
  const req = createRequest(keys.privateKey, rawBody, timestamp);
  const res = createResponseRecorder();

  await handleDiscordInteraction(req, res, rawBody, {
    env: { DISCORD_PUBLIC_KEY: keys.publicKeyHex },
    now,
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { type: 1 });
});

test('Agent Server exposes the signed Discord Interaction route', async () => {
  const keys = createKeyFixture();
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const rawBody = JSON.stringify({ type: 1 });
  const signed = createRequest(keys.privateKey, rawBody, timestamp);
  const req = Readable.from([rawBody]);
  req.method = 'POST';
  req.url = '/discord/interactions';
  req.headers = { host: 'localhost', ...signed.headers };
  const res = createResponseRecorder();

  await withEnv({ DISCORD_PUBLIC_KEY: keys.publicKeyHex }, async () => {
    await requestHandler(req, res);
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { type: 1 });
});

test('Unauthorized Discord command gets an ephemeral denial and does not call the router', async () => {
  const keys = createKeyFixture();
  const now = new Date('2026-08-04T12:00:00.000Z');
  const timestamp = String(Math.floor(now.getTime() / 1_000));
  const interaction = buildCommand();
  const rawBody = JSON.stringify(interaction);
  const req = createRequest(keys.privateKey, rawBody, timestamp);
  const res = createResponseRecorder();
  let routed = false;

  await handleDiscordInteraction(req, res, rawBody, {
    env: {
      DISCORD_PUBLIC_KEY: keys.publicKeyHex,
      DISCORD_GUILD_ID: interaction.guild_id,
      DISCORD_ALLOWED_USER_IDS: '999999999999999999',
    },
    now,
    router: async () => {
      routed = true;
      return { response: 'should not run' };
    },
  });

  const payload = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(payload.type, 4);
  assert.equal(payload.data.flags, 64);
  assert.match(payload.data.content, /허용되지 않은 Discord 사용자/);
  assert.equal(routed, false);
});

test('Authorized Discord command is deferred, routed, and updates the private original response', async () => {
  const keys = createKeyFixture();
  const now = new Date('2026-08-04T12:00:00.000Z');
  const timestamp = String(Math.floor(now.getTime() / 1_000));
  const interaction = buildCommand();
  const rawBody = JSON.stringify(interaction);
  const req = createRequest(keys.privateKey, rawBody, timestamp);
  const res = createResponseRecorder();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return fetchResponse(url.endsWith('/callback') ? 204 : 200, '');
  };

  await handleDiscordInteraction(req, res, rawBody, {
    env: {
      DISCORD_PUBLIC_KEY: keys.publicKeyHex,
      DISCORD_GUILD_ID: interaction.guild_id,
      DISCORD_ALLOWED_USER_IDS: interaction.member.user.id,
    },
    now,
    apiBase: 'https://discord.test/api/v10',
    fetcher,
    router: async received => {
      assert.equal(received.id, interaction.id);
      return { intent: 'portfolio_status', response: '<b>개인 포트폴리오</b> 결과' };
    },
  });

  assert.equal(res.statusCode, 202);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { type: 5, data: { flags: 64 } });
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(JSON.parse(calls[1].options.body).content, '**개인 포트폴리오** 결과');
  assert.deepEqual(JSON.parse(calls[1].options.body).allowed_mentions, { parse: [] });
});

test('Authorized Discord record button uses the requester-scoped component router and clears buttons', async () => {
  const keys = createKeyFixture();
  const now = new Date('2026-08-04T12:00:00.000Z');
  const timestamp = String(Math.floor(now.getTime() / 1_000));
  const interaction = buildCommand({
    type: 3,
    data: {
      custom_id: 'confirm:12345678-1234-1234-1234-123456789012:0123456789abcdef',
      component_type: 2,
    },
    message: { id: '666666666666666666' },
  });
  const rawBody = JSON.stringify(interaction);
  const req = createRequest(keys.privateKey, rawBody, timestamp);
  const res = createResponseRecorder();
  const calls = [];
  let cleaned = false;

  await handleDiscordInteraction(req, res, rawBody, {
    env: {
      DISCORD_PUBLIC_KEY: keys.publicKeyHex,
      DISCORD_GUILD_ID: interaction.guild_id,
      DISCORD_ALLOWED_USER_IDS: interaction.member.user.id,
      DISCORD_MENTION_ACTIONS_ENABLED: 'true',
      DISCORD_BOT_TOKEN: 'secret-token',
    },
    now,
    apiBase: 'https://discord.test/api/v10',
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return fetchResponse(url.endsWith('/callback') ? 204 : 200, '');
    },
    componentRouter: async received => {
      assert.equal(received.data.custom_id, interaction.data.custom_id);
      return { intent: 'pending_action_confirm', response: '기록 완료' };
    },
    componentCleaner: async received => {
      cleaned = received.message.id === interaction.message.id;
    },
  });

  assert.equal(res.statusCode, 202);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].options.body).content, '기록 완료');
  assert.equal(cleaned, true);
});

test('Discord content is clipped below the platform message limit', () => {
  const content = clipDiscordContent('가'.repeat(2_500));
  assert.ok(content.length <= 2_000);
  assert.match(content, /전체 내용/);
});

test('Gateway Interaction is deferred, routed, and edited without a public HTTP endpoint', async () => {
  const interaction = buildCommand();
  const calls = [];
  const result = await handleGatewayDiscordInteraction(interaction, {
    env: {
      DISCORD_GUILD_ID: interaction.guild_id,
      DISCORD_ALLOWED_USER_IDS: interaction.member.user.id,
    },
    apiBase: 'https://discord.test/api/v10',
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return fetchResponse(url.endsWith('/callback') ? 204 : 200);
    },
    router: async () => ({ intent: 'portfolio_status', response: '<b>Gateway 결과</b>' }),
  });

  assert.deepEqual(result, { handled: true, intent: 'portfolio_status' });
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].options.body), { type: 5, data: { flags: 64 } });
  assert.equal(JSON.parse(calls[1].options.body).content, '## Gateway 결과');
});

test('Gateway Interaction rejects a non-allowlisted user before routing', async () => {
  const interaction = buildCommand();
  const calls = [];
  let routed = false;
  const result = await handleGatewayDiscordInteraction(interaction, {
    env: {
      DISCORD_GUILD_ID: interaction.guild_id,
      DISCORD_ALLOWED_USER_IDS: '999999999999999999',
    },
    apiBase: 'https://discord.test/api/v10',
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return fetchResponse(204);
    },
    router: async () => {
      routed = true;
      return { response: 'should not run' };
    },
  });

  assert.equal(result.handled, false);
  assert.equal(routed, false);
  assert.equal(calls.length, 1);
  assert.match(JSON.parse(calls[0].options.body).data.content, /허용되지 않은 Discord 사용자/);
});
