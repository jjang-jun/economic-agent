const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateRecommendationSchema,
  applyRecommendationSchemaValidation,
} = require('../src/utils/recommendation-schema');

test('validateRecommendationSchema passes a complete recommendation candidate', () => {
  const result = validateRecommendationSchema({
    name: '삼성전자',
    ticker: '005930',
    thesis: 'HBM 수요 개선',
    reason: '관련 공시와 수급 개선',
    related_news: [0],
    invalidation: '20일선 이탈',
    risk_profile: {
      entryReferencePrice: 80000,
      stopLossPrice: 76000,
      riskReward: 2.2,
      suggestedWeightPct: 5,
      invalidation: '20일선 이탈',
    },
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.blockers, []);
});

test('applyRecommendationSchemaValidation downgrades incomplete recommendations', () => {
  const report = applyRecommendationSchemaValidation({
    stocks: [
      {
        name: '테마주',
        signal: 'bullish',
        reason: '뉴스 언급',
        risk_review: { approved: true, action: 'candidate', blockers: [] },
        risk_profile: { riskReward: 2.1 },
      },
    ],
  });

  assert.equal(report.stocks[0].schema_validation.passed, false);
  assert.equal(report.stocks[0].risk_review.approved, false);
  assert.equal(report.stocks[0].risk_review.action, 'watch_only');
  assert.ok(report.stocks[0].risk_review.blockers.some(item => item.startsWith('schema_')));
});
