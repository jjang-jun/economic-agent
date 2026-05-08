const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizePriceSourceQuality } = require('../src/utils/price-source-quality');

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
});
