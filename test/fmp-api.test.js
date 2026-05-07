const test = require('node:test');
const assert = require('node:assert/strict');
const {
  rowToFmpEodQuote,
  buildFmpFundamentalSummary,
  buildFmpEarningsSummary,
} = require('../src/sources/fmp-api');

test('rowToFmpEodQuote converts FMP historical row to adjusted EOD quote', () => {
  const quote = rowToFmpEodQuote({
    date: '2026-05-06',
    open: 180,
    high: 185,
    low: 178,
    close: 184,
    adjClose: 183.5,
    volume: 12345678,
  }, 'NVDA');

  assert.equal(quote.symbol, 'NVDA');
  assert.equal(quote.price, 183.5);
  assert.equal(quote.close, 184);
  assert.equal(quote.isAdjusted, true);
  assert.equal(quote.source, 'fmp-eod');
  assert.equal(quote.priceType, 'eod');
});

test('buildFmpFundamentalSummary derives growth and FCF margin', () => {
  const summary = buildFmpFundamentalSummary({
    income: [
      { date: '2025-12-31', fiscalYear: '2025', revenue: 120, netIncome: 24 },
      { date: '2024-12-31', fiscalYear: '2024', revenue: 100, netIncome: 20 },
    ],
    cashFlow: [
      { freeCashFlow: 18 },
    ],
    ratios: [
      { grossProfitMargin: 0.5, operatingProfitMargin: 0.25, debtToEquityRatio: 1.2, currentRatio: 1.5, priceToEarningsRatio: 30 },
    ],
  });

  assert.equal(summary.revenueGrowthYoYPct, 20);
  assert.equal(summary.netIncomeGrowthYoYPct, 20);
  assert.equal(summary.freeCashFlowMarginPct, 15);
  assert.equal(summary.grossProfitMarginPct, 50);
  assert.equal(summary.debtToEquity, 1.2);
});

test('buildFmpEarningsSummary finds next event and previous EPS surprise', () => {
  const summary = buildFmpEarningsSummary([
    { date: '2026-07-16', epsEstimated: 0.8, revenueEstimated: 1000 },
    { date: '2026-04-16', epsActual: 1.2, epsEstimated: 1.0, revenueActual: 900, revenueEstimated: 880 },
  ], new Date('2026-05-07T00:00:00Z'));

  assert.equal(summary.nextDate, '2026-07-16');
  assert.equal(summary.daysUntilNext, 70);
  assert.equal(summary.previousDate, '2026-04-16');
  assert.equal(summary.previousEpsSurprisePct, 20);
});
