const test = require('node:test');
const assert = require('node:assert/strict');
const { formatActionReport } = require('../src/notify/telegram');

test('formatActionReport caps stale suggested amounts by max new-buy amount', () => {
  const message = formatActionReport({
    date: '2026-05-08',
    portfolio: {
      totalAssetValue: 60000000,
      cashAmount: 15000000,
      cashRatio: 0.25,
      positionCount: 1,
      maxNewBuyAmount: 1000000,
    },
    newBuyCandidates: [{
      name: 'SK하이닉스',
      ticker: '000660',
      riskProfile: {
        suggestedAmount: 2966738,
        riskReward: 2,
      },
      riskReview: { action: 'candidate' },
    }],
    watchOnlyCandidates: [],
    holdCandidates: [],
    reduceCandidates: [],
    sellCandidates: [],
  });

  assert.match(message, /제안 1,000,000원 \(1회 상한\)/);
  assert.doesNotMatch(message, /2,966,738원/);
});
