const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTimingAlertReport,
  filterAlreadyAlerted,
  markTimingAlertsSent,
} = require('../src/utils/timing-alert');
const { formatTimingAlertReport } = require('../src/notify/telegram');

const now = new Date('2026-05-11T01:05:00.000Z');

const recommendation = {
  id: '2026-05-11:005930:bullish',
  date: '2026-05-11',
  createdAt: '2026-05-11T00:00:00.000Z',
  name: '삼성전자',
  ticker: '005930',
  symbol: '005930.KS',
  signal: 'bullish',
  conviction: 'high',
  reason: 'HBM 수요 개선',
  riskProfile: {
    riskReward: 2.4,
    expectedLossPct: 5,
    stopLossPrice: 76000,
    entryReferencePrice: 80000,
    suggestedAmount: 1000000,
    tradeable: true,
  },
  riskReview: {
    approved: true,
    action: 'candidate',
    blockers: [],
  },
};

const portfolio = {
  cashAmount: 3000000,
  totalAssetValue: 60000000,
  maxNewBuyAmount: 1000000,
  positions: [],
};

const quote = {
  symbol: '005930.KS',
  name: '삼성전자',
  price: 81000,
  return5dPct: 3,
  return20dPct: 8,
  movingAverage5d: 80000,
  movingAverage20d: 78500,
  distanceFromMa5Pct: 1.25,
  distanceFromMa20Pct: 3.18,
  ma20Slope5dPct: 0.8,
  priceAboveMa5: true,
  priceAboveMa20: true,
  ma5AboveMa20: true,
  volumeRatio20d: 1.4,
  averageTurnover20d: 9000000000,
  high20d: 80500,
  near20dHigh: true,
  breakout20d: true,
};

test('buildTimingAlertReport returns ready intraday domestic candidates', async () => {
  const report = await buildTimingAlertReport({
    recommendations: [recommendation],
    portfolio,
    mode: 'intraday',
    now,
    fetcher: async () => quote,
    benchmarkFetcher: async () => ({ symbol: '^KS11', return5dPct: 1, return20dPct: 4 }),
  });

  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].status, 'ready');
  assert.equal(report.candidates[0].entryTiming.action, 'breakout');
  assert.equal(report.candidates[0].buyPlan.firstAmount, 400000);
  assert.equal(report.candidates[0].buyPlan.firstQuantity, 4);
});

test('filterAlreadyAlerted suppresses duplicate intraday timing alerts', async () => {
  const report = await buildTimingAlertReport({
    recommendations: [recommendation],
    portfolio,
    mode: 'intraday',
    now,
    fetcher: async () => quote,
    benchmarkFetcher: async () => ({ symbol: '^KS11', return5dPct: 1, return20dPct: 4 }),
  });
  const state = markTimingAlertsSent(report, { alerts: [] });
  const filtered = filterAlreadyAlerted(report, state);

  assert.equal(filtered.candidates.length, 0);
});

test('formatTimingAlertReport explains price, timing, and split entry', async () => {
  const report = await buildTimingAlertReport({
    recommendations: [recommendation],
    portfolio,
    mode: 'premarket',
    now,
    fetcher: async () => quote,
    benchmarkFetcher: async () => ({ symbol: '^KS11', return5dPct: 1, return20dPct: 4 }),
  });
  const message = formatTimingAlertReport(report);

  assert.match(message, /장전 매매 타이밍 후보/);
  assert.match(message, /삼성전자/);
  assert.match(message, /돌파 분할매수/);
  assert.match(message, /1차 400,000원 \(4주\)/);
  assert.match(message, /장 시작 직후 추격매수 금지/);
});

test('formatTimingAlertReport labels first entry as conditional for watch candidates', () => {
  const message = formatTimingAlertReport({
    date: '2026-05-11',
    mode: 'premarket',
    readyCount: 0,
    watchCandidates: [{}],
    candidates: [{
      name: '현대위아',
      ticker: '011210',
      status: 'watch',
      entryTiming: { label: '과열, 눌림 대기' },
      marketProfile: { price: 90500, distanceFromMa20Pct: 8.81 },
      price: 90500,
      buyPlan: { firstAmount: 400000, firstQuantity: 4 },
      conditions: ['20일선 대비 +8% 미만으로 이격 축소'],
      blockers: ['risk_reward: 0.88:1 < 2.5:1'],
    }],
  });

  assert.match(message, /조건 충족 시 1차 400,000원 \(4주\)/);
});
