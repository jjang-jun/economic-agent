const test = require('node:test');
const assert = require('node:assert/strict');

function loadFreshSmokeScript(envPatch = {}) {
  const keys = Object.keys(envPatch);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(envPatch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  for (const modulePath of [
    require.resolve('../src/utils/persistence'),
    require.resolve('../scripts/smoke-telegram-actions'),
  ]) {
    delete require.cache[modulePath];
  }

  const script = require('../scripts/smoke-telegram-actions');
  return {
    script,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      delete require.cache[require.resolve('../src/utils/persistence')];
      delete require.cache[require.resolve('../scripts/smoke-telegram-actions')];
    },
  };
}

test('telegram smoke preflight reports Supabase persistence outage clearly', async () => {
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

  const { script, restore } = loadFreshSmokeScript({
    SUPABASE_PROJECT_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_RETRY_COUNT: '0',
    SUPABASE_CIRCUIT_BREAKER_MS: '60000',
  });

  try {
    await assert.rejects(
      script.assertPersistenceAvailable(),
      (err) => {
        assert.match(err.message, /Supabase persistence unavailable for Telegram smoke/);
        assert.equal(err.status, 503);
        assert.equal(err.transientSupabase, true);
        assert.equal(script.isTransientSupabaseError(err), true);
        return true;
      },
    );
  } finally {
    restore();
    global.fetch = previousFetch;
    console.warn = previousWarn;
  }
});

test('telegram smoke env helpers classify transient Supabase outages', () => {
  const { script, restore } = loadFreshSmokeScript();

  try {
    assert.equal(script.isTruthyEnv('true'), true);
    assert.equal(script.isTruthyEnv('1'), true);
    assert.equal(script.isTruthyEnv('false'), false);
    assert.equal(script.isTransientSupabaseError(new Error('503 Could not query the database for the schema cache')), true);
    assert.equal(script.isTransientSupabaseError(Object.assign(new Error('bad request'), { status: 400 })), false);
  } finally {
    restore();
  }
});

test('scheduled telegram smoke skips transient Supabase outages without failing', async () => {
  const previousFetch = global.fetch;
  const previousWarn = console.warn;
  const previousLog = console.log;
  const warnings = [];
  const logs = [];
  console.warn = message => warnings.push(String(message));
  console.log = message => logs.push(String(message));
  global.fetch = async () => new Response(JSON.stringify({
    code: 'PGRST002',
    message: 'Could not query the database for the schema cache. Retrying.',
  }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });

  const { script, restore } = loadFreshSmokeScript({
    TELEGRAM_SMOKE_CHAT_ID: '1234',
    TELEGRAM_SMOKE_ALLOW_TRANSIENT_SUPABASE: 'true',
    SUPABASE_PROJECT_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_RETRY_COUNT: '0',
    SUPABASE_CIRCUIT_BREAKER_MS: '60000',
  });

  try {
    await assert.doesNotReject(script.main());
    assert.ok(warnings.some(message => message.includes('telegram-smoke] skipped')));
    assert.ok(warnings.some(message => message.includes('::warning title=Telegram smoke skipped::')));
    assert.ok(logs.some(message => message.includes('transient_supabase_unavailable')));
  } finally {
    restore();
    global.fetch = previousFetch;
    console.warn = previousWarn;
    console.log = previousLog;
  }
});

test('manual telegram smoke still fails on transient Supabase outages', async () => {
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

  const { script, restore } = loadFreshSmokeScript({
    TELEGRAM_SMOKE_CHAT_ID: '1234',
    TELEGRAM_SMOKE_ALLOW_TRANSIENT_SUPABASE: 'false',
    SUPABASE_PROJECT_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_RETRY_COUNT: '0',
    SUPABASE_CIRCUIT_BREAKER_MS: '60000',
  });

  try {
    await assert.rejects(script.main(), /Supabase persistence unavailable for Telegram smoke/);
  } finally {
    restore();
    global.fetch = previousFetch;
    console.warn = previousWarn;
  }
});
