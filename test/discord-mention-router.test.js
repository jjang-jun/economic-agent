const test = require('node:test');
const assert = require('node:assert/strict');
const { routeDiscordMention } = require('../src/agent/discord-mention-router');
const {
  DiscordGatewayWorker,
  authorizeMentionMessage,
  discordMessagePayload,
  handleGatewayMessage,
  inspectRuntimeCompatibility,
  requireGatewayConfig,
} = require('../scripts/discord-agent-worker');

test('fatal Gateway close stops the scheduler so a supervisor can restart cleanly', async () => {
  let schedulerStopped = false;
  let fatalCode = null;
  const worker = new DiscordGatewayWorker({
    env: {},
    scheduler: {
      setGatewayConnected() {},
      async stop() { schedulerStopped = true; },
    },
    onFatalClose(code) { fatalCode = code; },
  });
  worker.handleClose({ code: 4014 });
  await worker.fatalClosePromise;
  assert.equal(worker.stopped, true);
  assert.equal(schedulerStopped, true);
  assert.equal(fatalCode, 4014);
});

test('Gateway error without a close event still schedules reconnection', async () => {
  class ErrorOnlyWebSocket {
    static OPEN = 1;

    constructor() {
      this.listeners = {};
      this.readyState = 0;
      this.closeCalls = 0;
    }

    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }

    close() {
      this.closeCalls += 1;
    }
  }

  const scheduler = {
    connected: true,
    setGatewayConnected(value) { this.connected = value; },
    async stop() {},
  };
  const worker = new DiscordGatewayWorker({
    env: {},
    scheduler,
    WebSocketClass: ErrorOnlyWebSocket,
  });
  worker.gatewayUrl = 'wss://gateway.example.test';
  await worker.connect();
  const socket = worker.socket;

  socket.listeners.error({ message: 'connection failed' });

  assert.equal(socket.closeCalls, 1);
  assert.equal(worker.socket, null);
  assert.equal(scheduler.connected, false);
  assert.ok(worker.reconnectTimer);
  await worker.stop();
});

test('Gateway close errors cannot recursively flood the worker log', async () => {
  class ReentrantErrorWebSocket {
    static OPEN = 1;

    constructor() {
      this.listeners = {};
      this.readyState = 0;
      this.closeCalls = 0;
      ReentrantErrorWebSocket.instance = this;
    }

    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }

    close() {
      this.closeCalls += 1;
      this.listeners.error({ message: 'close before open' });
    }
  }

  const scheduler = {
    disconnectedCalls: 0,
    setGatewayConnected(value) {
      if (!value) this.disconnectedCalls += 1;
    },
    async stop() {},
  };
  const worker = new DiscordGatewayWorker({
    env: {},
    scheduler,
    WebSocketClass: ReentrantErrorWebSocket,
  });
  worker.gatewayUrl = 'wss://gateway.example.test';
  await worker.connect();
  const socket = ReentrantErrorWebSocket.instance;

  socket.listeners.error({ message: 'connection failed' });

  assert.equal(socket.closeCalls, 1);
  assert.equal(scheduler.disconnectedCalls, 1);
  assert.equal(worker.reconnectAttempt, 1);
  assert.ok(worker.reconnectTimer);
  await worker.stop();
});

test('initial transient Gateway discovery failure keeps scheduler alive and retries', async () => {
  let schedulerStarted = false;
  let schedulerStopped = false;
  const scheduler = {
    setGatewayConnected() {},
    async start() { schedulerStarted = true; },
    async stop() { schedulerStopped = true; },
  };
  const worker = new DiscordGatewayWorker({
    env: {
      DISCORD_BOT_TOKEN: 'token',
      DISCORD_GUILD_ID: 'guild',
      DISCORD_ALLOWED_USER_IDS: 'user',
      DISCORD_ALLOWED_CHANNEL_IDS: 'channel',
    },
    scheduler,
    fetcher: async () => { throw new Error('network offline'); },
  });

  await worker.start();

  assert.equal(schedulerStarted, true);
  assert.equal(schedulerStopped, false);
  assert.equal(worker.stopped, false);
  assert.ok(worker.reconnectTimer);
  await worker.stop();
});

function message(content = '<@999> 삼성전자 3주를 7만원에 샀어') {
  return {
    id: '111111111111111111',
    guild_id: '222222222222222222',
    channel_id: '333333333333333333',
    author: { id: '444444444444444444', bot: false },
    mentions: [{ id: '999' }],
    content,
  };
}

const env = {
  DISCORD_GUILD_ID: '222222222222222222',
  DISCORD_ALLOWED_CHANNEL_IDS: '333333333333333333',
  DISCORD_ALLOWED_USER_IDS: '444444444444444444',
  DISCORD_MENTION_ACTIONS_ENABLED: 'true',
};

test('Discord worker runtime contract supports Node 22 on Windows, macOS, and Linux', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const result = inspectRuntimeCompatibility({
      platform,
      nodeVersion: '22.14.0',
      fetcher: () => {},
      WebSocketClass: class {},
      abortSignalTimeout: () => {},
    });
    assert.equal(result.ok, true, platform);
  }

  assert.equal(inspectRuntimeCompatibility({
    platform: 'win32',
    nodeVersion: '20.19.0',
    fetcher: () => {},
    WebSocketClass: class {},
    abortSignalTimeout: () => {},
  }).ok, false);
});

test('Discord worker npm entrypoints do not depend on an OS shell', () => {
  const scripts = require('../package.json').scripts;
  assert.equal(scripts['discord:agent-worker:check'], 'node scripts/discord-agent-worker.js --runtime-check');
  assert.equal(scripts['discord:agent-worker'], 'node --env-file-if-exists=.env scripts/discord-agent-worker.js');
});

test('Discord mention trade creates a requester-scoped draft and buttons', async () => {
  const persisted = [];
  const created = [];
  const result = await routeDiscordMention(message(), {
    env,
    instrumentLoader: async () => [{ ticker: '005930', name: '삼성전자' }],
    actionCreator: async input => {
      created.push(input);
      return {
        action: {
          id: '12345678-1234-1234-1234-123456789012',
          confirmationToken: '0123456789abcdef',
        },
        response: '<b>매수 기록 초안</b>',
      };
    },
    persister: async row => persisted.push(row),
  });

  assert.equal(created[0].chatId, 'discord:222222222222222222:333333333333333333:444444444444444444');
  assert.equal(created[0].text, '/buy 005930 3 70000 삼성전자');
  assert.equal(created[0].source, 'discord-mention-agent');
  assert.equal(result.components[0].components[0].custom_id, 'confirm:12345678-1234-1234-1234-123456789012:0123456789abcdef');
  assert.equal(persisted[0].payload.platform, 'discord_gateway');
});

test('Discord mention mutations are disabled by default while read-only questions remain available', async () => {
  let actionCreated = false;
  const actionResult = await routeDiscordMention(message(), {
    env: { ...env, DISCORD_MENTION_ACTIONS_ENABLED: undefined },
    instrumentLoader: async () => [{ ticker: '005930', name: '삼성전자' }],
    actionCreator: async () => {
      actionCreated = true;
      return {};
    },
    persister: async () => {},
  });
  assert.equal(actionResult.intent, 'discord_mention_actions_disabled');
  assert.equal(actionCreated, false);

  const queryResult = await routeDiscordMention(message('<@999> 내 포트폴리오 상태 알려줘'), {
    env,
    instrumentLoader: async () => assert.fail('read-only question should not load trade instruments'),
    responseBuilder: async command => ({ intent: 'portfolio_status', response: command }),
    persister: async () => {},
  });
  assert.equal(queryResult.response, '/portfolio');
});

test('Discord expert mentions persist the coordinator result and role-isolated agent runs', async () => {
  const persisted = [];
  let assignmentSeen;
  const result = await routeDiscordMention(message('<@999> to: 투자 전문가 cc: 리스크 관리자 삼성전자 추가 매수를 검토해줘'), {
    env: { ...env, DISCORD_EXPERT_RESPONSES_ENABLED: 'true' },
    expertRouter: async (text, options) => {
      assignmentSeen = options.assignment;
      return {
        intent: 'expert_investment',
        response: '**담당 배정**\nto: 투자 전문가',
        team: { coordinator: 'chief_of_staff', to: 'investment', cc: ['risk_manager'] },
        dataCutoff: {},
        agentRuns: [
          {
            role: options.assignment.primary,
            kind: 'primary',
            status: 'answered',
            text: '투자 답변',
            metadata: { totalTokens: 100 },
            contextScopes: ['portfolio', 'recommendations'],
            dataCutoff: { portfolio: 'now' },
          },
          {
            role: options.assignment.reviewers[0],
            kind: 'reviewer',
            status: 'answered',
            text: '리스크 검토',
            metadata: { totalTokens: 30 },
            contextScopes: ['risk_policy'],
            dataCutoff: {},
          },
        ],
      };
    },
    persister: async row => persisted.push(row),
  });

  assert.equal(assignmentSeen.primary.id, 'investment');
  assert.deepEqual(assignmentSeen.reviewers.map(role => role.id), ['risk_manager']);
  assert.equal(result.intent, 'expert_investment');
  assert.equal(persisted.length, 3);
  assert.equal(persisted[0].payload.expertTeam.to, 'investment');
  assert.match(persisted[1].chatId, /:expert:investment$/);
  assert.match(persisted[2].chatId, /:expert:risk_manager$/);
  assert.equal(persisted[1].payload.aiMetadata.totalTokens, 100);
});

test('recognized expert requests stay fail-closed until AI expert responses are enabled', async () => {
  let called = false;
  const result = await routeDiscordMention(message('<@999> 부동산 전문가에게 아파트를 물어볼게'), {
    env,
    expertRouter: async () => {
      called = true;
      return {};
    },
    persister: async () => {},
  });
  assert.equal(called, false);
  assert.equal(result.intent, 'discord_expert_responses_disabled');
  assert.match(result.response, /DISCORD_EXPERT_RESPONSES_ENABLED=true/);
});

test('ordinary risk status questions keep the deterministic read-only route', async () => {
  let expertCalled = false;
  const result = await routeDiscordMention(message('<@999> 현재 리스크 알려줘'), {
    env: { ...env, DISCORD_EXPERT_RESPONSES_ENABLED: 'true' },
    responseBuilder: async command => ({ intent: 'risk_status', response: command }),
    expertRouter: async () => {
      expertCalled = true;
      return {};
    },
    persister: async () => {},
  });

  assert.equal(expertCalled, false);
  assert.equal(result.intent, 'risk_status');
  assert.equal(result.response, '/risk');
});

test('Gateway mention authorization requires the exact bot mention, user, guild, and channel', () => {
  assert.equal(authorizeMentionMessage(message(), '999', env).allowed, true);
  assert.equal(authorizeMentionMessage({ ...message(), mentions: [] }, '999', env).allowed, false);
  assert.equal(authorizeMentionMessage({
    ...message('<@&777> 내 포트폴리오 상태 알려줘'),
    mentions: [],
    mention_roles: ['777'],
  }, '999', { ...env, DISCORD_AGENT_ROLE_IDS: '777' }).allowed, true);
  assert.equal(authorizeMentionMessage({
    ...message('<@&888> 내 포트폴리오 상태 알려줘'),
    mentions: [],
    mention_roles: ['888'],
  }, '999', { ...env, DISCORD_AGENT_ROLE_IDS: '777' }).allowed, false);
  assert.equal(authorizeMentionMessage({ ...message(), channel_id: '555' }, '999', env).allowed, false);
  assert.throws(() => requireGatewayConfig({
    DISCORD_BOT_TOKEN: 'token',
    DISCORD_GUILD_ID: env.DISCORD_GUILD_ID,
    DISCORD_ALLOWED_USER_IDS: env.DISCORD_ALLOWED_USER_IDS,
  }), /DISCORD_ALLOWED_CHANNEL_IDS/);
});

test('Gateway message handling ignores unauthorized messages and sends safe markdown replies', async () => {
  let routed = 0;
  let sentPayload;
  const handled = await handleGatewayMessage(message(), {
    env,
    botUserId: '999',
    router: async () => {
      routed += 1;
      return { intent: 'draft_buy', response: '<b>초안</b>', components: [] };
    },
    sender: async (source, result) => {
      sentPayload = discordMessagePayload(source, result);
    },
  });
  assert.equal(handled.handled, true);
  assert.equal(routed, 1);
  assert.equal(sentPayload.content, '## 초안');
  assert.deepEqual(sentPayload.allowed_mentions, { parse: [], replied_user: false });

  const ignored = await handleGatewayMessage({ ...message(), author: { id: 'unauthorized', bot: false } }, {
    env,
    botUserId: '999',
    router: async () => assert.fail('unauthorized message must not be routed'),
    sender: async () => assert.fail('unauthorized message must not be sent'),
  });
  assert.equal(ignored.handled, false);
});
