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
const {
  summarizeHttpError,
  shouldRetrySupabaseError,
  parseRetryAfterMs,
  getRetryDelayMs,
} = defaultPersistence;

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

test('parseRetryAfterMs supports seconds and HTTP dates', () => {
  const now = Date.parse('2026-07-29T00:00:00.000Z');
  assert.equal(parseRetryAfterMs('2', now), 2000);
  assert.equal(parseRetryAfterMs('Wed, 29 Jul 2026 00:00:03 GMT', now), 3000);
  assert.equal(parseRetryAfterMs('invalid', now), 0);
});

test('getRetryDelayMs honors Retry-After and caps the wait', () => {
  const previousRandom = Math.random;
  const previousMaxDelay = process.env.SUPABASE_RETRY_MAX_DELAY_MS;
  Math.random = () => 0.5;
  process.env.SUPABASE_RETRY_MAX_DELAY_MS = '5000';

  try {
    assert.equal(getRetryDelayMs({ retryAfterMs: 3000 }, 0, 300), 3000);
    assert.equal(getRetryDelayMs({ retryAfterMs: 9000 }, 0, 300), 5000);
    assert.equal(getRetryDelayMs({}, 2, 300), 1200);
  } finally {
    Math.random = previousRandom;
    if (previousMaxDelay === undefined) delete process.env.SUPABASE_RETRY_MAX_DELAY_MS;
    else process.env.SUPABASE_RETRY_MAX_DELAY_MS = previousMaxDelay;
  }
});

test('Supabase requests time out before the surrounding job timeout', async () => {
  const previousFetch = global.fetch;
  const previousWarn = console.warn;
  console.warn = () => {};
  global.fetch = async (_url, options = {}) => new Promise((resolve, reject) => {
    const keepAlive = setTimeout(resolve, 1000);
    options.signal?.addEventListener('abort', () => {
      clearTimeout(keepAlive);
      reject(options.signal.reason);
    }, { once: true });
  });

  const { persistence, restore } = loadFreshPersistence({
    SUPABASE_PROJECT_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_RETRY_COUNT: '0',
    SUPABASE_REQUEST_TIMEOUT_MS: '10',
    SUPABASE_CIRCUIT_BREAKER_MS: '60000',
  });

  try {
    const startedAt = Date.now();
    const result = await persistence.selectRows('articles', { select: 'id', limit: '1' });
    assert.equal(result.rows, null);
    assert.equal(result.error.name, 'TimeoutError');
    assert.equal(result.error.timeout, true);
    assert.match(result.error.message, /timed out after 10ms/);
    assert.ok(Date.now() - startedAt < 1000);
  } finally {
    restore();
    global.fetch = previousFetch;
    console.warn = previousWarn;
  }
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

test('price provider telemetry failure does not open the critical persistence circuit', async () => {
  const previousFetch = global.fetch;
  const previousWarn = console.warn;
  console.warn = () => {};
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ message: 'temporary telemetry outage' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200,
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
    const telemetry = await persistence.persistPriceProviderAttempt({
      provider: 'test-provider',
      ticker: '005930',
      priceType: 'current',
      status: 'failed',
    });
    const criticalRead = await persistence.selectRows('stock_reports', {
      select: 'id',
      limit: '1',
    });

    assert.equal(telemetry.saved, 0);
    assert.equal(telemetry.error.status, 503);
    assert.deepEqual(criticalRead.rows, []);
    assert.equal(criticalRead.skipped, undefined);
    assert.equal(calls, 2);
  } finally {
    restore();
    global.fetch = previousFetch;
    console.warn = previousWarn;
  }
});

test('persistence supports keyless localhost PostgREST as the preferred database endpoint', async () => {
  const previousFetch = global.fetch;
  let requestUrl = '';
  let requestHeaders;
  global.fetch = async (url, options = {}) => {
    requestUrl = String(url);
    requestHeaders = options.headers;
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const { persistence, restore } = loadFreshPersistence({
    DATABASE_REST_URL: 'http://127.0.0.1:3000',
    DATABASE_REST_KEY: undefined,
    SUPABASE_PROJECT_URL: 'https://legacy.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-key-must-not-leak',
  });

  try {
    const result = await persistence.selectRows('articles', { select: 'id', limit: '1' });
    assert.deepEqual(result.rows, []);
    assert.match(requestUrl, /^http:\/\/127\.0\.0\.1:3000\/articles\?/);
    assert.equal(requestHeaders.apikey, undefined);
    assert.equal(requestHeaders.Authorization, undefined);
  } finally {
    restore();
    global.fetch = previousFetch;
  }
});
