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
      positionSize: {
        limits: {
          risk: 4000000,
          new_buy_cap: 3000000,
          new_buy_amount_cap: 1000000,
          cash: 15000000,
        },
      },
    },
  });

  assert.match(line, /2026-05-07:005930:bullish/);
  assert.match(line, /진입 70,000/);
  assert.match(line, /손절 66,500/);
  assert.match(line, /상승 후보/);
  assert.match(line, /신뢰도 높음/);
  assert.match(line, /매수 검토 가능/);
  assert.match(line, /1회 신규매수 상한 기준/);
});

test('formatRecommendationLine translates watch only neutral recommendations', () => {
  const line = formatRecommendationLine({
    id: 'r1',
    name: '관찰종목',
    ticker: '000001',
    signal: 'neutral',
    conviction: 'low',
    riskReview: {
      action: 'watch_only',
      blockers: ['risk_reward: 1.6:1 < 2:1'],
    },
    riskProfile: {},
  });

  assert.match(line, /관찰/);
  assert.match(line, /신뢰도 낮음/);
  assert.match(line, /관찰만/);
  assert.match(line, /제안금액 없음/);
  assert.match(line, /차단: risk_reward/);
});
