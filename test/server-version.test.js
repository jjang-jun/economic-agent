const assert = require('node:assert/strict');
const test = require('node:test');
const { buildVersionPayload } = require('../src/server');
const pkg = require('../package.json');

test('buildVersionPayload exposes deploy metadata without secrets', () => {
  const payload = buildVersionPayload();

  assert.equal(payload.ok, true);
  assert.equal(payload.service, 'economic-agent');
  assert.equal(payload.version, pkg.version);
  assert.equal(payload.mode, 'agent-server');
  assert.equal(Object.hasOwn(payload, 'commitSha'), true);
});
