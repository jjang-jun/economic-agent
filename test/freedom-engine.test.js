const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFreedomScenarios } = require('../src/utils/freedom-engine');

test('buildFreedomScenarios compares monthly saving and return assumptions', () => {
  const scenarios = buildFreedomScenarios({
    currentNetWorth: 57377347,
    targetNetWorth: 1000000000,
    targetMonths: 127,
    monthlyAmounts: [2000000, 3000000],
    annualReturnPcts: [12, 15],
    now: new Date('2026-05-10T00:00:00+09:00'),
  });

  assert.equal(scenarios.length, 4);
  assert.deepEqual(
    scenarios.map(item => `${item.monthlySavingAmount}:${item.annualReturnPct}`),
    ['2000000:12', '2000000:15', '3000000:12', '3000000:15']
  );
  assert.ok(scenarios[0].monthsToTarget > scenarios[1].monthsToTarget);
  assert.ok(scenarios[0].monthsToTarget > scenarios[2].monthsToTarget);
  assert.equal(scenarios[0].estimatedTargetDate, '2039-04-10');
  assert.equal(scenarios[0].onTrack, false);
});
