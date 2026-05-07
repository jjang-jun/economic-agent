const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBehaviorReview } = require('../src/utils/behavior-reviewer');

test('buildBehaviorReview flags unlinked and blocked candidate buys', () => {
  const recommendations = [
    {
      id: 'r1',
      signal: 'bullish',
      relatedNews: ['a1'],
      riskProfile: { riskReward: 1.5, expectedLossPct: 5, tradeable: false },
      riskReview: { action: 'watch_only', approved: false },
    },
  ];
  const trades = [
    { id: 't1', side: 'buy', ticker: 'AAA' },
    { id: 't2', side: 'buy', ticker: 'BBB', recommendationId: 'r1' },
  ];

  const review = buildBehaviorReview({ recommendations, trades });

  assert.equal(review.tradeReview.unlinkedBuys, 1);
  assert.equal(review.tradeReview.watchOnlyBuys, 1);
  assert.equal(review.tradeReview.lowRiskRewardBuys, 1);
  assert.ok(review.warnings.some(item => item.includes('추천과 연결되지 않은 매수')));
  assert.ok(review.warnings.some(item => item.includes('관찰/차단 후보')));
});
