const test = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizePriceSourceQuality,
  buildPriceSourceQualityAnomalies,
  buildPriceProviderDecision,
} = require('../src/utils/price-source-quality');
const { parseArgs, formatSummary } = require('../scripts/price-provider-ops-report');

test('summarizePriceSourceQuality separates official EOD and fallback sources', () => {
  const summary = summarizePriceSourceQuality([
    { ticker: '005930', source: 'krx-openapi', price_type: 'eod', as_of: '2026-05-07T15:30:00+09:00' },
    { ticker: '000660', source: 'data-go-kr', price_type: 'eod', as_of: '2026-05-07T15:30:00+09:00' },
    { ticker: '002230', source: 'kis-rest', price_type: 'eod', as_of: '2026-05-07T15:30:00+09:00' },
    { ticker: '005930', source: 'naver-finance', price_type: 'current', as_of: '2026-05-08T10:00:00+09:00' },
    { ticker: 'NVDA', source: 'yahoo-finance', price_type: 'current', as_of: '2026-05-07T16:00:00-04:00' },
  ], {
    now: new Date('2026-05-08T12:00:00+09:00'),
    attempts: [
      { provider: 'krx-openapi', status: 'success' },
      { provider: 'data-go-kr', status: 'empty' },
      { provider: 'kis-rest', status: 'failed' },
    ],
  });

  assert.equal(summary.totalSnapshots, 5);
  assert.equal(summary.tickerCount, 4);
  assert.equal(summary.eodSnapshots, 3);
  assert.equal(summary.officialEod.total, 2);
  assert.equal(summary.officialEod.krx, 1);
  assert.equal(summary.officialEod.dataGoKr, 1);
  assert.equal(summary.officialEod.ratePct, 66.67);
  assert.equal(summary.kisEodFallback, 1);
  assert.equal(summary.fallback.total, 2);
  assert.equal(summary.fallback.ratePct, 40);
  assert.equal(summary.attempts.total, 3);
  assert.equal(summary.attempts.failed, 1);
  assert.equal(summary.attempts.failureRatePct, 33.33);
  assert.equal(summary.healthLabel, 'ok');
  assert.equal(summary.providerDecision.action, 'ok');
});

test('buildPriceSourceQualityAnomalies flags provider failures and fallback overuse', () => {
  const anomalies = buildPriceSourceQualityAnomalies({
    totalSnapshots: 10,
    fallback: { ratePct: 60 },
    staleSnapshots: 4,
    attempts: {
      total: 10,
      failed: 4,
      empty: 1,
      failureRatePct: 40,
      emptyRatePct: 10,
      byProvider: [
        { provider: 'kis-rest', count: 5, failed: 3, failureRatePct: 60 },
      ],
    },
  }, {
    minAttempts: 5,
    maxFailureRatePct: 30,
    maxFallbackRatePct: 50,
    maxStaleSnapshots: 3,
  });

  assert.deepEqual(anomalies, [
    '가격 provider 실패율 40% (4/10)',
    'kis-rest 실패율 60% (3/5)',
    'Naver/Yahoo fallback 비중 60%',
    '오래된 가격 스냅샷 4건',
  ]);
});

test('buildPriceProviderDecision explains when paid data should be considered', () => {
  const decision = buildPriceProviderDecision({
    totalSnapshots: 100,
    fallback: { ratePct: 65, yahoo: 60 },
    officialEod: { ratePct: 100 },
    attempts: { failureRatePct: 0, emptyRatePct: 75 },
  });

  assert.equal(decision.action, 'consider_paid_data');
  assert.equal(decision.label, '해외/글로벌 가격 API 보강 검토');
  assert.ok(decision.reasons.includes('fallback 가격 비중 65%'));
});

test('buildPriceProviderDecision prioritizes failures over fallback usage', () => {
  const decision = buildPriceProviderDecision({
    totalSnapshots: 10,
    fallback: { ratePct: 90 },
    officialEod: { ratePct: 100 },
    attempts: { total: 10, failureRatePct: 40, emptyRatePct: 0 },
  });

  assert.equal(decision.action, 'fix_provider');
  assert.equal(decision.label, 'API 키/토큰/네트워크 장애 우선 점검');
});

test('price provider ops args support noTelegram and explicit days', () => {
  assert.deepEqual(parseArgs(['--noTelegram'], {}), { days: 1, noTelegram: true });
  assert.deepEqual(parseArgs(['--days', '7'], {}), { days: 7, noTelegram: false });
  assert.deepEqual(parseArgs(['--days=3', '--no-telegram'], {}), { days: 3, noTelegram: true });
});

test('price provider ops summary includes provider decision and anomalies', () => {
  const message = formatSummary({
    healthLabel: 'warn',
    totalSnapshots: 10,
    tickerCount: 3,
    officialEod: { ratePct: 40 },
    fallback: { ratePct: 63 },
    providerDecision: { label: '해외/글로벌 가격 API 보강 검토' },
    attempts: {
      total: 5,
      success: 3,
      failed: 0,
      empty: 2,
      failureRatePct: 0,
      emptyRatePct: 40,
      byProvider: [
        { provider: 'yahoo-finance', count: 3, failed: 0, failureRatePct: 0 },
      ],
    },
  }, ['Naver/Yahoo fallback 비중 63%']);

  assert.match(message, /가격 Provider 점검/);
  assert.match(message, /판단: 해외\/글로벌 가격 API 보강 검토/);
  assert.match(message, /Naver\/Yahoo fallback 비중 63%/);
});
