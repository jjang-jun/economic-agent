const test = require('node:test');
const assert = require('node:assert/strict');

function loadFreshPersistence(envPatch = {}) {
  const keys = Object.keys(envPatch);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(envPatch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const modulePath = require.resolve('../src/utils/persistence');
  delete require.cache[modulePath];
  const persistence = require('../src/utils/persistence');

  return {
    persistence,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      delete require.cache[modulePath];
    },
  };
}

const { persistence: defaultPersistence } = loadFreshPersistence();
const { summarizeHttpError, shouldRetrySupabaseError } = defaultPersistence;

test('summarizeHttpError keeps Cloudflare HTML errors compact', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>fgywttjmnikkvcjscith.supabase.co | 521: Web server is down</title></head>
      <body><span class="code-label">Error code 521</span></body>
    </html>
  `;

  assert.equal(summarizeHttpError(521, html, 'text/html'), '521 Cloudflare 521');
});

test('summarizeHttpError extracts json message without leaking full body', () => {
  const body = JSON.stringify({
    code: 'PGRST301',
    message: 'JWT expired',
    details: 'long internal detail',
  });

  assert.equal(summarizeHttpError(401, body, 'application/json'), '401 JWT expired');
});

test('shouldRetrySupabaseError retries transient statuses only', () => {
  assert.equal(shouldRetrySupabaseError(Object.assign(new Error('bad gateway'), { status: 502 })), true);
  assert.equal(shouldRetrySupabaseError(Object.assign(new Error('rate limited'), { status: 429 })), true);
  assert.equal(shouldRetrySupabaseError(Object.assign(new Error('unauthorized'), { status: 401 })), false);
  assert.equal(shouldRetrySupabaseError(new Error('network failed')), true);
});

test('Supabase transient failure opens circuit breaker for follow-up persistence calls', async () => {
  const previousFetch = global.fetch;
  const previousWarn = console.warn;
  console.warn = () => {};
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      code: 'PGRST002',
      message: 'Could not query the database for the schema cache. Retrying.',
    }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  };

  const { persistence, restore } = loadFreshPersistence({
    SUPABASE_PROJECT_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_RETRY_COUNT: '0',
    SUPABASE_CIRCUIT_BREAKER_MS: '60000',
  });

  try {
    const first = await persistence.selectRows('articles', { select: 'id', limit: '1' });
    const second = await persistence.selectRows('articles', { select: 'id', limit: '1' });

    assert.equal(first.rows, null);
    assert.equal(first.error.status, 503);
    assert.equal(second.rows, null);
    assert.equal(second.skipped, true);
      assert.equal(second.error.circuitOpen, true);
    assert.equal(calls, 1);
  } finally {
    restore();
    global.fetch = previousFetch;
    console.warn = previousWarn;
  }
});
