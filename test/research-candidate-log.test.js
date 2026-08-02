const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getResearchCandidateId,
  shouldTrackResearchCandidate,
  buildResearchCandidatesFromReports,
} = require('../src/utils/research-candidate-log');

test('shadow cohort tracks schema-valid directional candidates rejected by live risk rules', () => {
  assert.equal(shouldTrackResearchCandidate({
    signal: 'bullish',
    schema_validation: { passed: true },
    risk_review: { approved: false, action: 'watch_only', blockers: ['market_regime: RISK_OFF'] },
  }), true);

  assert.equal(shouldTrackResearchCandidate({
    signal: 'bullish',
    schema_validation: { passed: true },
    risk_review: { approved: true, action: 'candidate' },
  }), false);

  assert.equal(shouldTrackResearchCandidate({
    signal: 'neutral',
    schema_validation: { passed: true },
    risk_review: { approved: false, action: 'watch_only' },
  }), false);

  assert.equal(shouldTrackResearchCandidate({
    signal: 'bearish',
    schema_validation: { passed: false },
    risk_review: { approved: false, action: 'watch_only' },
  }), false);
});

test('historical stock reports backfill point-in-time shadow candidates with AI metadata', async () => {
  const result = await buildResearchCandidatesFromReports([{
    date: '2026-07-31',
    created_at: '2026-07-31T09:50:00.000Z',
    report: {
      generatedAt: '2026-07-31T09:49:00.000Z',
      aiMetadata: { provider: 'qwen', model: 'qwen3.7-plus', promptVersion: 'stock-analysis-v2.3' },
      decision: { market: { regime: 'NEUTRAL', score: 1 } },
      stocks: [{
        name: '삼성전자',
        ticker: '005930',
        signal: 'bullish',
        schema_validation: { passed: true },
        risk_review: { approved: false, action: 'watch_only', blockers: ['entry_timing: chase'] },
        risk_profile: { entryReferencePrice: 80000 },
        market_profile: {
          price: 80000,
          currency: 'KRW',
          source: 'naver-finance',
          marketTime: '2026-07-31T06:30:00.000Z',
        },
        related_article_ids: ['article-1'],
      }],
    },
  }]);

  assert.equal(result.added, 1);
  assert.equal(result.candidates[0].id, 'shadow:2026-07-31:005930:bullish');
  assert.equal(result.candidates[0].entry.marketTime, '2026-07-31T06:30:00.000Z');
  assert.equal(result.candidates[0].benchmark, null);
  assert.equal(result.candidates[0].aiMetadata.model, 'qwen3.7-plus');
  assert.equal(result.candidates[0].tradeEligible, false);
});

test('shadow candidate ids cannot collide with approved recommendation ids', () => {
  assert.equal(
    getResearchCandidateId('2026-08-03', { ticker: '005930', signal: 'bullish' }),
    'shadow:2026-08-03:005930:bullish',
  );
});
