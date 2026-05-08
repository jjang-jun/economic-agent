const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addKstDays,
  historyFromEodRows,
  buildEodEvaluationQuote,
  shouldLogRecommendation,
} = require('../src/utils/recommendation-log');

test('addKstDays returns KST calendar target date', () => {
  assert.equal(addKstDays('2026-05-07', 1), '2026-05-08');
  assert.equal(addKstDays('2026-05-07', 5), '2026-05-12');
});

test('buildEodEvaluationQuote uses latest EOD row with history', () => {
  const quote = buildEodEvaluationQuote([
    {
      ticker: '005930',
      symbol: '005930.KS',
      price: 10000,
      close: 10000,
      high: 10300,
      low: 9900,
      marketTime: '2026-05-07T06:30:00.000Z',
      source: 'data-go-kr',
      priceType: 'eod',
    },
    {
      ticker: '005930',
      symbol: '005930.KS',
      price: 11000,
      close: 11000,
      high: 11200,
      low: 10800,
      marketTime: '2026-05-08T06:30:00.000Z',
      source: 'data-go-kr',
      priceType: 'eod',
    },
  ]);

  assert.equal(quote.price, 11000);
  assert.equal(quote.source, 'data-go-kr');
  assert.equal(quote.isRealtime, false);
  assert.deepEqual(historyFromEodRows([quote]).map(row => row.close), [11000]);
  assert.equal(quote.history.length, 2);
  assert.equal(quote.history[0].high, 10300);
});

test('shouldLogRecommendation excludes watch-only risk review candidates', () => {
  assert.equal(shouldLogRecommendation({
    schema_validation: { passed: true },
    risk_review: { approved: false, action: 'watch_only' },
  }), false);

  assert.equal(shouldLogRecommendation({
    schema_validation: { passed: true },
    risk_review: { approved: true, action: 'candidate' },
  }), true);

  assert.equal(shouldLogRecommendation({
    schema_validation: { passed: true },
  }), false);
});
