const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('agent harness documentation map stays linked', () => {
  const result = spawnSync('node', ['scripts/agent-harness-check.js'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agent-harness-check] ok/);
});
