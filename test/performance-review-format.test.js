const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPerformanceReview } = require('../src/notify/telegram');

test('formatPerformanceReview explains recommendation and execution metrics in plain Korean', () => {
  const message = formatPerformanceReview({
    period: 'weekly',
    startDate: '2026-05-01',
    endDate: '2026-05-08',
    recommendationSummary: {
      total: 10,
      evaluated: 6,
      winRatePct: 50,
      avgSignalReturnPct: 2.4,
      avgAlphaPct: 1.1,
    },
    tradeSummary: {
      total: 3,
      linked: 2,
      linkedRatePct: 66.7,
    },
    performanceLab: {
      executedRecommendationQuality: { avgSignalReturnPct: 1.5 },
      missedRecommendationQuality: { avgSignalReturnPct: 3.2 },
    },
    behaviorReview: {
      tradeReview: {
        buyTrades: 2,
        unlinkedBuys: 1,
        watchOnlyBuys: 0,
      },
    },
    collectorOps: {
      totalRuns: 100,
      completedRuns: 100,
      successfulRuns: 99,
      failedRuns: 1,
      totalImmediateAlerts: 0,
      alertEvents: {
        pendingDigest: 4,
        pendingCatchUp: 0,
      },
    },
    notes: ['실제 거래 중 추천과 연결되지 않은 비중이 높습니다.'],
  });

  assert.match(message, /한줄 판단/);
  assert.match(message, /AI 추천 성과/);
  assert.match(message, /승률: 50% - 평가 완료 추천 중 방향이 맞은 비율/);
  assert.match(message, /평균 추천 수익률: 2.4% - 추천 방향 기준 평균 성과/);
  assert.match(message, /시장 대비 초과수익: 1.1% - KOSPI\/Nasdaq 등 기준지수보다 더 잘했는지/);
  assert.match(message, /내 실행 품질/);
  assert.match(message, /추천을 실제로 산 경우 평균: 1.5%/);
  assert.match(message, /추천했지만 매수하지 않은 경우 평균: 3.2%/);
  assert.match(message, /추천 수익률은 실제 계좌 수익률이 아닙니다/);
});
