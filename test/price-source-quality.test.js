const test = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizePriceSourceQuality,
  buildPriceSourceQualityAnomalies,
  buildPriceProviderDecision,
} = require('../src/utils/price-source-quality');
const {
  getKSTClock,
  parseArgs,
  formatSummary,
  shouldSendScheduledOpsReport,
} = require('../scripts/price-provider-ops-report');

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
  assert.equal(summary.fallback.domesticTotal, 1);
  assert.equal(summary.fallback.domesticRatePct, 20);
  assert.equal(summary.fallback.globalTotal, 1);
  assert.equal(summary.fallback.globalRatePct, 100);
  assert.equal(summary.attempts.total, 3);
  assert.equal(summary.attempts.failed, 1);
  assert.equal(summary.attempts.failureRatePct, 33.33);
  assert.equal(summary.healthLabel, 'ok');
  assert.equal(summary.providerDecision.action, 'ok');
});

test('buildPriceSourceQualityAnomalies flags provider failures and fallback overuse', () => {
  const anomalies = buildPriceSourceQualityAnomalies({
    totalSnapshots: 10,
    fallback: { ratePct: 60, domesticRatePct: 60 },
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
    '국내 Naver/Yahoo fallback 비중 60%',
    '오래된 가격 스냅샷 4건',
  ]);
});

test('buildPriceProviderDecision treats global Yahoo current quotes as monitoring unless failures exist', () => {
  const decision = buildPriceProviderDecision({
    totalSnapshots: 100,
    fallback: {
      ratePct: 65,
      domesticRatePct: 0,
      globalRatePct: 100,
      globalCurrentTotal: 60,
      yahoo: 60,
    },
    officialEod: { ratePct: 100 },
    attempts: { failureRatePct: 0, emptyRatePct: 75 },
  });

  assert.equal(decision.action, 'monitor_global_fallback');
  assert.equal(decision.label, '해외 실시간 가격 API는 필요 시 보강');
  assert.ok(decision.reasons.includes('해외 Yahoo 현재가 사용 60건'));
});

test('buildPriceProviderDecision prioritizes domestic fallback over global Yahoo usage', () => {
  const decision = buildPriceProviderDecision({
    totalSnapshots: 100,
    fallback: {
      ratePct: 65,
      domesticRatePct: 65,
      globalRatePct: 100,
      globalCurrentTotal: 60,
      naver: 40,
      yahoo: 25,
    },
    officialEod: { ratePct: 100 },
    attempts: { failureRatePct: 0, emptyRatePct: 20 },
  });

  assert.equal(decision.action, 'improve_domestic_data');
  assert.equal(decision.label, '국내 가격 provider 우선순위/키 점검');
  assert.ok(decision.reasons.includes('국내 fallback 가격 비중 65%'));
});

test('buildPriceProviderDecision prioritizes failures over fallback usage', () => {
  const decision = buildPriceProviderDecision({
    totalSnapshots: 10,
    fallback: { ratePct: 90, domesticRatePct: 90 },
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
    fallback: { ratePct: 63, domesticRatePct: 10, globalRatePct: 100 },
    providerDecision: { label: '해외 실시간 가격 API는 필요 시 보강' },
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
  assert.match(message, /판단: 해외 실시간 가격 API는 필요 시 보강/);
  assert.match(message, /국내 fallback: 10%/);
  assert.match(message, /해외 Yahoo: 100%/);
});

test('price provider ops skips delayed scheduled sends outside quiet-hours window', () => {
  assert.equal(
    shouldSendScheduledOpsReport(new Date('2026-05-11T14:55:00.000Z'), { GITHUB_EVENT_NAME: 'schedule' }),
    true,
  );
  assert.equal(
    shouldSendScheduledOpsReport(new Date('2026-05-11T17:14:00.000Z'), { GITHUB_EVENT_NAME: 'schedule' }),
    false,
  );
  assert.equal(
    shouldSendScheduledOpsReport(new Date('2026-05-11T17:14:00.000Z'), {
      GITHUB_EVENT_NAME: 'schedule',
      PRICE_PROVIDER_ALLOW_OFF_HOURS: '1',
    }),
    true,
  );
});

test('getKSTClock formats KST label', () => {
  assert.deepEqual(getKSTClock(new Date('2026-05-11T17:14:00.000Z')), {
    hour: 2,
    minute: 14,
    minutes: 134,
    label: '02:14 KST',
  });
});
