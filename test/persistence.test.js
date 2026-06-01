const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeHttpError, shouldRetrySupabaseError } = require('../src/utils/persistence');

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
