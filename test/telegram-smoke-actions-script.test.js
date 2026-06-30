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
      /Supabase persistence unavailable for Telegram smoke/,
    );
  } finally {
    restore();
    global.fetch = previousFetch;
    console.warn = previousWarn;
  }
});
