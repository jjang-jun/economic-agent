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
      { limit: '2', offset: '0' },
      { limit: '2', offset: '2' },
    ]);
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
