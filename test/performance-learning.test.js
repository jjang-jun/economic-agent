const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPerformanceLearningFromReview } = require('../src/utils/performance-learning');
const { normalizeRecommendationRisk } = require('../src/utils/recommendation-risk');
const { reviewStock } = require('../src/utils/risk-reviewer');

test('performance learning raises risk reward and blocks borderline candidates', () => {
  const learning = buildPerformanceLearningFromReview({
    id: '2026-05-27:weekly',
    period: 'weekly',
    performanceLab: {
      failureAnalysis: [
        { reason: 'low_risk_reward', count: 2 },
      ],
    },
    behaviorReview: {
      recommendationHygiene: { belowMinRiskReward: 2 },
      tradeReview: {},
    },
    tradeSummary: { linkedRatePct: 100 },
  });

  assert.equal(learning.rules.minRiskReward, 2.5);
  assert.ok(learning.actions.some(item => item.includes('최소 손익비')));

  const decision = {
    market: { regime: 'RISK_ON', tags: [] },
    portfolio: {
      cashAmount: 1000000,
      totalAssetValue: 10000000,
      maxNewBuyRatio: 0.05,
      positions: [],
    },
    performanceLearning: learning,
  };
  const risk = normalizeRecommendationRisk({
    ticker: '005930',
    expected_upside_pct: 12,
    expected_loss_pct: 5,
    market_profile: {
      price: 10000,
      liquid: true,
      relativeStrength20d: 1,
      near20dHigh: true,
      entryTiming: { approved: true, label: '눌림목 분할매수' },
    },
  }, decision);

  assert.equal(risk.riskReward, 2.4);
  assert.equal(risk.performanceLearning.minRiskReward, 2.5);
  assert.equal(risk.tradeable, false);

  const review = reviewStock({
    ticker: '005930',
    risk_profile: {
      ...risk,
      suggestedAmount: 500000,
      invalidation: '20일선 이탈',
    },
    market_profile: {
      liquid: true,
      relativeStrength20d: 1,
      near20dHigh: true,
      averageTurnover20d: 10000000000,
      entryTiming: { approved: true, label: '눌림목 분할매수' },
    },
  }, decision);

  assert.equal(review.approved, false);
  assert.equal(review.action, 'watch_only');
  assert.ok(review.blockers.some(item => item.includes('risk_reward')));
});

test('performance learning requires stop and entry timing after drawdown failures', () => {
  const learning = buildPerformanceLearningFromReview({
    id: '2026-05-27:weekly',
    performanceLab: {
      failureAnalysis: [
        { reason: 'large_drawdown', count: 1 },
      ],
    },
    behaviorReview: {
      recommendationHygiene: { missingStop: 1 },
      tradeReview: {},
    },
  });

  assert.equal(learning.rules.requireStop, true);
  assert.equal(learning.rules.requireEntryTimingApproval, true);

  const review = reviewStock({
    risk_profile: {
      riskReward: 3,
      expectedLossPct: null,
      stopLossPrice: null,
      suggestedAmount: 500000,
      invalidation: '20일선 이탈',
      tradeable: true,
    },
    market_profile: {
      liquid: true,
      relativeStrength20d: 1,
      near20dHigh: true,
      averageTurnover20d: 10000000000,
      entryTiming: { approved: null, label: '확인 필요' },
    },
  }, {
    market: { regime: 'RISK_ON', tags: [] },
    performanceLearning: learning,
  });

  assert.equal(review.approved, false);
  assert.ok(review.blockers.some(item => item.includes('learning_entry_timing')));
  assert.ok(review.blockers.some(item => item.includes('learning_stop_required')));
});
