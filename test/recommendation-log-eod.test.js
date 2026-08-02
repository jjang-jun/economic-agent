const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addKstDays,
  historyFromEodRows,
  buildEodEvaluationQuote,
  shouldLogRecommendation,
  resolveRecommendationAiMetadata,
  calculateBenchmarkSignalReturn,
  buildRecommendation,
  selectTradingSessionRows,
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

test('evaluation horizons use exchange sessions instead of calendar days', () => {
  const selected = selectTradingSessionRows([
    { price: 100, marketTime: '2026-05-07T06:30:00.000Z' },
    { price: 101, marketTime: '2026-05-08T06:30:00.000Z' },
    { price: 102, marketTime: '2026-05-11T06:30:00.000Z' },
    { price: 103, marketTime: '2026-05-12T06:30:00.000Z' },
  ], '2026-05-07', 2);

  assert.equal(selected.targetDate, '2026-05-11');
  assert.equal(selected.rows.length, 2);
  assert.equal(selected.rows.at(-1).price, 102);
});

test('domestic EOD policy keeps Yahoo as the final historical fallback', () => {
  const { PRICE_SOURCE_POLICY } = require('../src/config/price-source-policy');
  assert.equal(PRICE_SOURCE_POLICY.eodOfficial.domestic.at(-1), 'yahoo-finance');
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

test('resolveRecommendationAiMetadata carries report model metadata into recommendations', () => {
  const reportMetadata = {
    task: 'stock_analysis',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    promptVersion: 'stock-analysis-v2.1',
  };

  assert.deepEqual(
    resolveRecommendationAiMetadata({}, { aiMetadata: reportMetadata }, {}),
    reportMetadata,
  );

  assert.deepEqual(
    resolveRecommendationAiMetadata(
      { ai_metadata: { provider: 'openai', model: 'gpt-4.1-mini', prompt_version: 'stock-analysis-v2.0' } },
      { aiMetadata: reportMetadata },
      {},
    ),
    { provider: 'openai', model: 'gpt-4.1-mini', prompt_version: 'stock-analysis-v2.0' },
  );

  assert.equal(resolveRecommendationAiMetadata({}, { aiMetadata: {} }, {}), null);
});

test('calculateBenchmarkSignalReturn aligns benchmark direction for bearish signals', () => {
  assert.equal(calculateBenchmarkSignalReturn('bullish', -5), -5);
  assert.equal(calculateBenchmarkSignalReturn('bearish', -5), 5);
});

test('buildRecommendation preserves analysis-time stock and benchmark snapshots', async () => {
  const recommendation = await buildRecommendation({
    name: '삼성전자',
    ticker: '005930',
    signal: 'bullish',
    risk_profile: { entryReferencePrice: 80000 },
    market_profile: {
      price: 80000,
      currency: 'KRW',
      source: 'naver-finance',
      priceType: 'delayed',
      marketTime: '2026-08-01T06:30:00.000Z',
      benchmarkSymbol: '^KS11',
      benchmarkPrice: 3250,
      benchmarkCurrency: 'KRW',
      benchmarkMarketTime: '2026-08-01T06:30:00.000Z',
      benchmarkSource: 'naver-finance',
    },
  }, [], {}, '2026-08-01');

  assert.deepEqual(recommendation.entry, {
    price: 80000,
    currency: 'KRW',
    marketTime: '2026-08-01T06:30:00.000Z',
    source: 'naver-finance',
    priceType: 'delayed',
  });
  assert.deepEqual(recommendation.benchmark, {
    symbol: '^KS11',
    entryPrice: 3250,
    currency: 'KRW',
    marketTime: '2026-08-01T06:30:00.000Z',
    source: 'naver-finance',
  });
});
