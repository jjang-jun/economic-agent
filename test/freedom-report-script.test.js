const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../scripts/freedom-report');

test('freedom report script keeps console mode by default and supports Discord delivery', () => {
  assert.deepEqual(parseArgs([]), {
    discord: false,
    noPersist: false,
    noSave: false,
  });
  assert.deepEqual(parseArgs(['--discord', '--noPersist', '--no-save']), {
    discord: true,
    noPersist: true,
    noSave: true,
  });
  assert.deepEqual(parseArgs(['--no-persist', '--noSave']), {
    discord: false,
    noPersist: true,
    noSave: true,
  });
});
