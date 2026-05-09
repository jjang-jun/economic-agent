const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const pythonAvailable = spawnSync('python3', ['--version']).status === 0;

test('local backtest worker reports optional provider availability as JSON', { skip: !pythonAvailable }, () => {
  const result = spawnSync('python3', ['scripts/local-backtest-worker.py', 'providers'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.providers.pykrx, 'boolean');
  assert.equal(typeof payload.providers.FinanceDataReader, 'boolean');
  assert.match(payload.usage.ohlcv, /ohlcv/);
});
