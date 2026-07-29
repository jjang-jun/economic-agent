const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildModelPerformanceReadiness,
  formatReadiness,
} = require('../scripts/model-performance-readiness');

test('buildModelPerformanceReadiness reports sample readiness by model and prompt', () => {
  const recommendationRows = [
    {
      id: 'r1',
      name: 'A',
      signal: 'bullish',
      ai_metadata: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', promptVersion: 'stock-analysis-v2.1' },
      risk_review: { approved: true, action: 'candidate' },
      risk_profile: { riskReward: 2, expectedLossPct: 5 },
      payload: { id: 'r1', entry: { price: 100 }, evaluations: {} },
    },
    {
      id: 'r2',
      name: 'B',
      signal: 'bullish',
      ai_metadata: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', promptVersion: 'stock-analysis-v2.1' },
      risk_review: { approved: true, action: 'candidate' },
      risk_profile: { riskReward: 2, expectedLossPct: 5 },
      payload: { id: 'r2', entry: { price: 100 }, evaluations: {} },
    },
    {
      id: 'legacy',
      name: 'Legacy',
      signal: 'bullish',
      risk_review: { approved: true, action: 'candidate' },
      risk_profile: { riskReward: 2, expectedLossPct: 5 },
      payload: { id: 'legacy', entry: { price: 100 }, evaluations: {} },
    },
    {
      id: 'pending-meta',
      name: 'Pending',
      signal: 'bullish',
      ai_metadata: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', promptVersion: 'stock-analysis-v2.1' },
      risk_review: { approved: true, action: 'candidate' },
      risk_profile: { riskReward: 2, expectedLossPct: 5 },
      payload: { id: 'pending-meta', entry: { price: 100 }, evaluations: {} },
    },
  ];
  const evaluationRows = [
    { recommendation_id: 'r1', day: 20, signal_return_pct: 3, alpha_pct: 1 },
    { recommendation_id: 'r2', day: 20, signal_return_pct: -1, alpha_pct: -2 },
    { recommendation_id: 'legacy', day: 20, signal_return_pct: 0 },
  ];

  const readiness = buildModelPerformanceReadiness({ recommendationRows, evaluationRows, minEvaluated: 2 });

  assert.equal(readiness.totalRecommendations, 4);
  assert.equal(readiness.eligibleRecommendations, 4);
  assert.equal(readiness.evaluatedRecommendations, 3);
  assert.equal(readiness.missingMetadata, 1);
  assert.equal(readiness.metadataCoverage.totalWithMetadata, 3);
  assert.equal(readiness.metadataCoverage.evaluatedWithMetadata, 2);
  assert.equal(readiness.metadataCoverage.unevaluatedWithMetadata, 1);
  assert.equal(readiness.modelLeaders[0].key, 'anthropic:claude-sonnet-4-20250514');
  assert.equal(readiness.modelLeaders[0].ready, true);
  assert.equal(readiness.promptLeaders[0].key, 'stock-analysis-v2.1');
  assert.equal(readiness.modelLeaders.find(item => item.key === 'unknown_provider:unknown_model').ready, false);
  assert.equal(readiness.modelLeaders.find(item => item.key === 'unknown_provider:unknown_model').metadataMissing, true);

  const message = formatReadiness(readiness);
  assert.match(message, /메타데이터 누락 평가 추천: 1건/);
  assert.match(message, /메타데이터 보유 추천: 3건 · 평가 대기 중 메타데이터 보유: 1건/);
  assert.match(message, /프롬프트\+모델 설정별/);
  assert.match(message, /판단 가능/);
  assert.match(message, /unknown_provider:unknown_model .* 메타데이터 누락/);
});
