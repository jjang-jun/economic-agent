const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getLatestRecommendations,
  getLatestBlockedRecommendations,
  isBuyCandidateRecommendation,
  formatRecommendationLine,
  formatRecentRecommendationsFromList,
  humanizeRiskReason,
} = require('../src/agent/recommendations-view');

test('getLatestRecommendations sorts by createdAt descending', () => {
  const latest = getLatestRecommendations([
    {
      id: 'old',
      createdAt: '2026-05-06T00:00:00Z',
      riskReview: { approved: true, action: 'candidate' },
      riskProfile: { riskReward: 2.5, entryReferencePrice: 10000, stopLossPrice: 9500 },
    },
    {
      id: 'new',
      createdAt: '2026-05-07T00:00:00Z',
      riskReview: { approved: true, action: 'candidate' },
      riskProfile: { riskReward: 2.5, entryReferencePrice: 10000, stopLossPrice: 9500 },
    },
  ], 1);

  assert.equal(latest[0].id, 'new');
});

test('getLatestRecommendations excludes watch-only recommendations by default', () => {
  const recommendations = [
    { id: 'blocked', createdAt: '2026-05-08T00:00:00Z', riskReview: { approved: false, action: 'watch_only' } },
    {
      id: 'candidate',
      createdAt: '2026-05-07T00:00:00Z',
      riskReview: { approved: true, action: 'candidate' },
      riskProfile: { riskReward: 2.5, entryReferencePrice: 10000, stopLossPrice: 9500 },
    },
  ];

  assert.equal(isBuyCandidateRecommendation(recommendations[0]), false);
  assert.equal(isBuyCandidateRecommendation(recommendations[1]), true);
  assert.deepEqual(getLatestRecommendations(recommendations).map(item => item.id), ['candidate']);
  assert.deepEqual(getLatestBlockedRecommendations(recommendations).map(item => item.id), ['blocked']);
});

test('getLatestRecommendations excludes legacy items without risk contract', () => {
  const recommendations = [
    { id: 'legacy', createdAt: '2026-05-08T00:00:00Z' },
    {
      id: 'low-rr',
      createdAt: '2026-05-07T00:00:00Z',
      riskReview: { approved: true, action: 'candidate' },
      riskProfile: { riskReward: 1.2, entryReferencePrice: 10000, stopLossPrice: 9500 },
    },
  ];

  assert.deepEqual(getLatestRecommendations(recommendations).map(item => item.id), []);
  assert.deepEqual(getLatestBlockedRecommendations(recommendations).map(item => item.id), ['legacy', 'low-rr']);
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

test('formatRecentRecommendationsFromList separates sections and items with blank lines', () => {
  const text = formatRecentRecommendationsFromList([
    {
      id: 'candidate-1',
      name: '후보1',
      createdAt: '2026-05-08T00:00:00Z',
      riskReview: { approved: true, action: 'candidate' },
      riskProfile: { riskReward: 2.5, entryReferencePrice: 10000, stopLossPrice: 9500 },
    },
    {
      id: 'candidate-2',
      name: '후보2',
      createdAt: '2026-05-07T00:00:00Z',
      riskReview: { approved: true, action: 'candidate' },
      riskProfile: { riskReward: 2.5, entryReferencePrice: 10000, stopLossPrice: 9500 },
    },
    { id: 'blocked-1', name: '차단1', createdAt: '2026-05-09T00:00:00Z', riskReview: { approved: false, action: 'watch_only' } },
  ], { limit: 5 });

  assert.match(text, /후보1[\s\S]*\n\n▸ <b>후보2<\/b>/);
  assert.doesNotMatch(text, /최근 차단\/관찰 후보/);
  assert.match(text, /차단\/관찰 후보 확인/);
});

test('formatRecentRecommendationsFromList only shows blocked items when requested', () => {
  const recommendations = [
    { id: 'blocked-1', name: '차단1', createdAt: '2026-05-09T00:00:00Z', riskReview: { approved: false, action: 'watch_only' } },
  ];

  const defaultText = formatRecentRecommendationsFromList(recommendations, { limit: 5 });
  assert.doesNotMatch(defaultText, /최근 차단\/관찰 후보/);
  assert.doesNotMatch(defaultText, /차단1/);

  const blockedText = formatRecentRecommendationsFromList(recommendations, { limit: 5, includeBlocked: true });
  assert.match(blockedText, /최근 차단\/관찰 후보/);
  assert.match(blockedText, /차단1/);
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
  assert.match(line, /매수 제안 없음/);
  assert.match(line, /차단: 손익비 부족/);
  assert.match(line, /기대수익이 예상손실의 1.6배/);
});

test('formatRecommendationLine hides buy amount for watch-only candidates', () => {
  const line = formatRecommendationLine({
    id: 'r2',
    name: '관찰종목',
    ticker: '000002',
    signal: 'neutral',
    conviction: 'low',
    riskReview: {
      action: 'watch_only',
      blockers: ['risk_reward: 1.6:1 < 2:1'],
      warnings: ['risk_reward: 1.6:1 < 2:1'],
    },
    riskProfile: {
      suggestedAmount: 1000000,
    },
  });

  assert.match(line, /매수 제안 없음/);
  assert.doesNotMatch(line, /제안 1,000,000원/);
  assert.equal((line.match(/손익비 부족/g) || []).length, 1);
});

test('humanizeRiskReason explains common internal blockers', () => {
  assert.equal(
    humanizeRiskReason('position_size: no available amount'),
    '매수 가능 금액 없음: 현금, 종목 비중, 섹터 비중 또는 1회 한도에 걸림'
  );
  assert.match(
    humanizeRiskReason('risk_reward: 1.14:1 / min 2.5:1'),
    /최소 기준 2.5배보다 낮음/
  );
  assert.match(
    humanizeRiskReason('schema_identity_name_mismatch: recommended 현대건설 / official 현대위아'),
    /종목명-티커 불일치/
  );
});
