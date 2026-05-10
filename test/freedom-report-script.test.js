const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../scripts/freedom-report');

test('freedom report script keeps console mode by default and supports telegram flag', () => {
  assert.deepEqual(parseArgs([]), {
    telegram: false,
    noPersist: false,
    noSave: false,
  });
  assert.deepEqual(parseArgs(['--telegram', '--noPersist', '--no-save']), {
    telegram: true,
    noPersist: true,
    noSave: true,
  });
  assert.deepEqual(parseArgs(['--no-persist', '--noSave']), {
    telegram: false,
    noPersist: true,
    noSave: true,
  });
});
