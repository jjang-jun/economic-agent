const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getLatestRecommendations,
  formatRecommendationLine,
} = require('../src/agent/recommendations-view');

test('getLatestRecommendations sorts by createdAt descending', () => {
  const latest = getLatestRecommendations([
    { id: 'old', createdAt: '2026-05-06T00:00:00Z' },
    { id: 'new', createdAt: '2026-05-07T00:00:00Z' },
  ], 1);

  assert.equal(latest[0].id, 'new');
});

test('formatRecommendationLine includes id and entry/stop levels', () => {
  const line = formatRecommendationLine({
    id: '2026-05-07:005930:bullish',
    name: '삼성전자',
    ticker: '005930',
    signal: 'bullish',
    conviction: 'high',
    riskReview: { action: 'candidate' },
    riskProfile: {
      entryReferencePrice: 70000,
      stopLossPrice: 66500,
      suggestedAmount: 1000000,
    },
  });

  assert.match(line, /2026-05-07:005930:bullish/);
  assert.match(line, /진입 70,000/);
  assert.match(line, /손절 66,500/);
});
