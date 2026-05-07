const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPerformanceLab, riskRewardBucket } = require('../src/utils/performance-lab');

test('buildPerformanceLab separates executed and missed recommendation quality', () => {
  const recommendations = [
    {
      id: 'r1',
      signal: 'bullish',
      conviction: 'high',
      riskProfile: { riskReward: 2.4 },
      evaluations: { 1: { signalReturnPct: 5, alphaPct: 2, maxFavorableExcursionPct: 7, maxAdverseExcursionPct: -1, stopTouched: false, targetTouched: true } },
    },
    {
      id: 'r2',
      signal: 'bullish',
      conviction: 'low',
      riskProfile: { riskReward: 1.6 },
      evaluations: { 1: { signalReturnPct: -3, alphaPct: -4, maxFavorableExcursionPct: 1, maxAdverseExcursionPct: -5, stopTouched: true, targetTouched: false } },
    },
  ];
  const trades = [{ id: 't1', side: 'buy', recommendationId: 'r1' }];

  const lab = buildPerformanceLab({ recommendations, trades });

  assert.equal(lab.recommendationQuality.evaluated, 2);
  assert.equal(lab.recommendationQuality.winRatePct, 50);
  assert.equal(lab.executedRecommendationQuality.avgSignalReturnPct, 5);
  assert.equal(lab.missedRecommendationQuality.avgSignalReturnPct, -3);
  assert.equal(lab.byRiskReward['2.0-3.0'].evaluated, 1);
});

test('riskRewardBucket groups missing and low risk reward values', () => {
  assert.equal(riskRewardBucket({ riskProfile: {} }), 'missing');
  assert.equal(riskRewardBucket({ riskProfile: { riskReward: 1.4 } }), '<1.5');
  assert.equal(riskRewardBucket({ riskProfile: { riskReward: 1.8 } }), '1.5-2.0');
  assert.equal(riskRewardBucket({ riskProfile: { riskReward: 3 } }), '>=3.0');
});
