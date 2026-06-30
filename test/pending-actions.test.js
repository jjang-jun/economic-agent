const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureActionUsable, formatPendingActions, parseTradeMetadata } = require('../src/agent/pending-actions');

function loadFreshPendingActions(envPatch = {}) {
  const keys = Object.keys(envPatch);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(envPatch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  for (const modulePath of [
    require.resolve('../src/utils/persistence'),
    require.resolve('../src/agent/pending-actions'),
  ]) {
    delete require.cache[modulePath];
  }

  const pendingActions = require('../src/agent/pending-actions');
  return {
    pendingActions,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      delete require.cache[require.resolve('../src/utils/persistence')];
      delete require.cache[require.resolve('../src/agent/pending-actions')];
    },
  };
}

test('ensureActionUsable rejects callback from a different chat', () => {
  assert.throws(() => ensureActionUsable({
    status: 'pending',
    chat_id: 'private-chat',
    confirmation_token: 'token',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }, 'token', { chatId: 'shared-chat' }), /chat mismatch/);
});

test('ensureActionUsable accepts matching chat and token', () => {
  assert.doesNotThrow(() => ensureActionUsable({
    status: 'pending',
    chat_id: 'private-chat',
    confirmation_token: 'token',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }, 'token', { chatId: 'private-chat' }));
});

test('formatPendingActions renders empty state without persistence', async () => {
  const text = await formatPendingActions('chat');

  assert.match(text, /대기 중인 승인 작업/);
  assert.match(text, /대기 중인 작업이 없습니다/);
});

test('parseTradeMetadata separates recommendation id from display name', () => {
  assert.deepEqual(
    parseTradeMetadata(['삼성전자', 'rec=2026-05-07:005930:bullish']),
    { name: '삼성전자', recommendationId: '2026-05-07:005930:bullish' }
  );
  assert.deepEqual(
    parseTradeMetadata(['Netflix', '--rec', 'rec-1']),
    { name: 'Netflix', recommendationId: 'rec-1' }
  );
});

test('createPendingAction fails clearly when pending action persistence is unavailable', async () => {
  const previousFetch = global.fetch;
  const previousWarn = console.warn;
  console.warn = () => {};
  global.fetch = async () => new Response(JSON.stringify({
    code: 'PGRST002',
    message: 'Could not query the database for the schema cache. Retrying.',
  }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });

  const { pendingActions, restore } = loadFreshPendingActions({
    SUPABASE_PROJECT_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_RETRY_COUNT: '0',
    SUPABASE_CIRCUIT_BREAKER_MS: '60000',
  });

  try {
    await assert.rejects(
      pendingActions.createPendingAction({
        chatId: 'private-chat',
        text: '/buy 005930 1 1 smoke-buy',
      }),
      /pending action 저장 실패/,
    );
  } finally {
    restore();
    global.fetch = previousFetch;
    console.warn = previousWarn;
  }
});
