const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { backfillRealEstate, parseArgs } = require('../scripts/backfill-real-estate');

test('backfill requires enough months for annual comparisons', () => {
  const args = parseArgs(['--months=2', '--regions=11680'], {});
  assert.equal(args.months.length, 13);
});

test('backfill checkpoints completed regions and resumes without repeating them', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'real-estate-backfill-'));
  const stateFile = path.join(directory, 'state.json');
  const calls = [];
  const options = {
    dryRun: false,
    reset: false,
    stateFile,
    months: ['202608', '202607'],
    regionCodes: ['11680', '11710'],
    concurrency: 1,
    collector: async input => { calls.push(input.regionCodes[0]); return { ok: true }; },
  };
  const first = await backfillRealEstate(options);
  const second = await backfillRealEstate(options);
  assert.deepEqual(calls, ['11680', '11710']);
  assert.equal(first.completedRegions, 2);
  assert.equal(second.processedNow, 0);
});
