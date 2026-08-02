const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getResearchCandidateId,
  shouldTrackResearchCandidate,
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

test('shadow candidate ids cannot collide with approved recommendation ids', () => {
  assert.equal(
    getResearchCandidateId('2026-08-03', { ticker: '005930', signal: 'bullish' }),
    'shadow:2026-08-03:005930:bullish',
  );
});
