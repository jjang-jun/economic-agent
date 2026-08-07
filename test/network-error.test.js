const test = require('node:test');
const assert = require('node:assert/strict');
const { formatNetworkError } = require('../src/utils/network-error');

test('network errors retain nested DNS and timeout causes for workflow diagnosis', () => {
  const error = new TypeError('fetch failed', {
    cause: Object.assign(new Error('getaddrinfo ENOTFOUND example.com'), { code: 'ENOTFOUND' }),
  });
  assert.match(formatNetworkError(error), /ENOTFOUND/);
  assert.match(formatNetworkError(error), /fetch failed/);
  assert.match(formatNetworkError(error), /getaddrinfo/);
});
