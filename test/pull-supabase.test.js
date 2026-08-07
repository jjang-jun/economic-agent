const test = require('node:test');
const assert = require('node:assert/strict');

function loadFreshPullScript(envPatch = {}) {
  const keys = Object.keys(envPatch);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(envPatch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const modulePath = require.resolve('../scripts/pull-supabase');
  delete require.cache[modulePath];
  const script = require('../scripts/pull-supabase');

  return {
    script,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      delete require.cache[modulePath];
    },
  };
}

test('fetchTable paginates past the Supabase default row window', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    const parsed = new URL(String(url));
    calls.push({
      limit: parsed.searchParams.get('limit'),
      offset: parsed.searchParams.get('offset'),
      order: parsed.searchParams.get('order'),
    });
    const offset = Number(parsed.searchParams.get('offset') || 0);
    const rows = offset === 0
      ? [{ id: 'a' }, { id: 'b' }]
      : [{ id: 'c' }];
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const { script, restore } = loadFreshPullScript({
    SUPABASE_PROJECT_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  });

  try {
    const rows = await script.fetchTable('articles', { pageSize: 2, fetchFn });

    assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c']);
    assert.deepEqual(calls, [
      { limit: '2', offset: '0', order: 'id.asc' },
      { limit: '2', offset: '2', order: 'id.asc' },
    ]);
  } finally {
    restore();
  }
});

test('fetchTable orders non-id primary keys deterministically', async () => {
  let requestUrl = '';
  const fetchFn = async url => {
    requestUrl = String(url);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const { script, restore } = loadFreshPullScript({
    SUPABASE_PROJECT_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  });
  try {
    await script.fetchTable('daily_summaries', { pageSize: 2, fetchFn });
    assert.equal(new URL(requestUrl).searchParams.get('order'), 'date.asc');
  } finally {
    restore();
  }
});

test('fetchTable retries transient Supabase pull failures', async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({
        code: 'PGRST002',
        message: 'Could not query the database for the schema cache. Retrying.',
      }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const previousWarn = console.warn;
  console.warn = () => {};
  const { script, restore } = loadFreshPullScript({
    SUPABASE_PROJECT_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    SUPABASE_RETRY_COUNT: '1',
    SUPABASE_RETRY_DELAY_MS: '0',
  });

  try {
    const rows = await script.fetchTable('articles', { pageSize: 2, fetchFn });

    assert.deepEqual(rows, []);
    assert.equal(calls, 2);
  } finally {
    restore();
    console.warn = previousWarn;
  }
});

test('fetchTable supports keyless localhost PostgREST without Supabase path prefix', async () => {
  let requestUrl = '';
  let requestHeaders;
  const fetchFn = async (url, options = {}) => {
    requestUrl = String(url);
    requestHeaders = options.headers;
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const { script, restore } = loadFreshPullScript({
    DATABASE_REST_URL: 'http://127.0.0.1:3000',
    SUPABASE_PROJECT_URL: 'https://legacy.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'legacy-key-must-not-leak',
  });

  try {
    await script.fetchTable('articles', { pageSize: 2, fetchFn });
    assert.match(requestUrl, /^http:\/\/127\.0\.0\.1:3000\/articles\?/);
    assert.deepEqual(requestHeaders, {});
  } finally {
    restore();
  }
});

test('explicit Supabase source stays remote when a local DATABASE_REST_URL is configured', async () => {
  let requestUrl = '';
  let requestHeaders;
  const fetchFn = async (url, options = {}) => {
    requestUrl = String(url);
    requestHeaders = options.headers;
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const { script, restore } = loadFreshPullScript({
    DATABASE_REST_URL: 'http://127.0.0.1:3210',
    SUPABASE_PROJECT_URL: 'https://legacy.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'remote-service-key',
  });

  try {
    await script.fetchTable('articles', {
      supabaseUrl: 'https://legacy.supabase.co',
      supabaseKey: 'remote-service-key',
      pageSize: 2,
      fetchFn,
    });
    assert.match(requestUrl, /^https:\/\/legacy\.supabase\.co\/rest\/v1\/articles\?/);
    assert.equal(requestHeaders.apikey, 'remote-service-key');
  } finally {
    restore();
  }
});
