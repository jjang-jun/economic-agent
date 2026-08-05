const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../scripts/performance-review');

test('performance review script parses period and output flags', () => {
  assert.deepEqual(parseArgs([]), {
    period: 'weekly',
    noReport: false,
    noPersist: false,
    noSave: false,
  });
  assert.deepEqual(parseArgs(['monthly', '--no-report', '--noPersist']), {
    period: 'monthly',
    noReport: true,
    noPersist: true,
    noSave: false,
  });
  assert.deepEqual(parseArgs(['--no-report', '--no-persist', '--no-save']), {
    period: 'weekly',
    noReport: true,
    noPersist: true,
    noSave: true,
  });
});

test('performance review dry-run skips save, persistence, and report delivery', () => {
  assert.deepEqual(parseArgs(['monthly', '--dry-run']), {
    period: 'monthly',
    noReport: true,
    noPersist: true,
    noSave: true,
  });
});
