const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPerformanceLab,
  riskRewardBucket,
  classifyFailure,
  sectorKey,
  riskFactorKeys,
} = require('../src/utils/performance-lab');

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

test('buildPerformanceLab groups sector, risk factors, and failure reasons', () => {
  const recommendations = [
    {
      id: 'r1',
      name: 'A',
      conviction: 'high',
      signal: 'bullish',
      riskProfile: { riskReward: 2.4, expectedLossPct: 5 },
      marketProfile: { sector: 'semiconductor' },
      relatedNews: ['a1'],
      evaluations: { 5: { signalReturnPct: 4, alphaPct: 1, stopTouched: false } },
    },
    {
      id: 'r2',
      name: 'B',
      conviction: 'low',
      signal: 'bullish',
      riskProfile: { riskReward: 1.3, expectedLossPct: 8 },
      marketProfile: { sector: 'construction' },
      relatedNews: ['a2'],
      evaluations: { 5: { signalReturnPct: -3, alphaPct: -2, stopTouched: false } },
    },
  ];
  const lab = buildPerformanceLab({ recommendations, trades: [] });

  assert.equal(lab.bySector.semiconductor.evaluated, 1);
  assert.equal(lab.bySector.construction.avgSignalReturnPct, -3);
  assert.equal(lab.byRiskFactor.low_rr.evaluated, 1);
  assert.equal(lab.failureAnalysis[0].reason, 'low_risk_reward');
});

test('classifyFailure and risk factor helpers explain common cases', () => {
  const recommendation = {
    conviction: 'low',
    riskProfile: { riskReward: 2.5 },
    riskReview: { approved: false, action: 'watch_only', blockers: ['market_regime: RISK_OFF'] },
    evaluations: { 1: { signalReturnPct: -1, stopTouched: true } },
  };

  assert.equal(classifyFailure(recommendation), 'stop_touched');
  assert.equal(sectorKey({ fundamentalProfile: { sector: 'Technology' } }), 'Technology');
  assert.ok(riskFactorKeys(recommendation).includes('blocked_or_watch'));
  assert.ok(riskFactorKeys(recommendation).includes('blocker:market_regime'));
});
