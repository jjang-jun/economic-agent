const test = require('node:test');
const assert = require('node:assert/strict');
const { rowToFmpEodQuote } = require('../src/sources/fmp-api');

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
