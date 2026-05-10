const test = require('node:test');
const assert = require('node:assert/strict');
const { formatFreedomStatus } = require('../src/notify/telegram');

test('formatFreedomStatus explains target progress and stress without internal jargon', () => {
  const message = formatFreedomStatus({
    date: '2026-05-10',
    currentNetWorth: 20000000,
    targetProgressPct: 1.94,
    monthlySavingAmount: 3000000,
    expectedAnnualReturnPct: 6,
    monthsToTarget: 155,
    estimatedTargetDate: '2039-04-10',
    targetDate: '2036-12-31',
    targetMonths: 127,
    requiredAnnualReturnPct: 12.3,
    goal: {
      targetNetWorth: 1028571429,
      targetDate: '2036-12-31',
    },
    stress: {
      drawdownPct: 20,
      stressedNetWorth: 16000000,
      delayMonths: 3,
    },
  });

  assert.match(message, /경제적 자유 상태/);
  assert.match(message, /현재 순자산: 20,000,000원/);
  assert.match(message, /달성률: 1.94%/);
  assert.match(message, /목표일보다 2년 4개월 늦은 속도/);
  assert.match(message, /목표일까지 필요한 연수익률: 12.3%/);
  assert.match(message, /20% 하락 시 순자산: 16,000,000원/);
  assert.doesNotMatch(message, /NaN|undefined|null/);
});
