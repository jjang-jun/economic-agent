const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../scripts/performance-review');

test('performance review script parses period and output flags', () => {
  assert.deepEqual(parseArgs([]), {
    period: 'weekly',
    noTelegram: false,
    noPersist: false,
    noSave: false,
  });
  assert.deepEqual(parseArgs(['monthly', '--noTelegram', '--noPersist']), {
    period: 'monthly',
    noTelegram: true,
    noPersist: true,
    noSave: false,
  });
  assert.deepEqual(parseArgs(['--no-telegram', '--no-persist', '--no-save']), {
    period: 'weekly',
    noTelegram: true,
    noPersist: true,
    noSave: true,
  });
});

test('performance review dry-run skips save, persistence, and telegram', () => {
  assert.deepEqual(parseArgs(['monthly', '--dry-run']), {
    period: 'monthly',
    noTelegram: true,
    noPersist: true,
    noSave: true,
  });
});

