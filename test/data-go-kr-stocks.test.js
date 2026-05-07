const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDate, rowToQuote } = require('../src/sources/data-go-kr-stocks');

test('normalizeDate accepts dashed and compact dates only', () => {
  assert.equal(normalizeDate('2026-05-07'), '20260507');
  assert.equal(normalizeDate('20260507'), '20260507');
  assert.equal(normalizeDate('2026/05/07'), '');
});

test('rowToQuote converts public data stock price row to EOD quote', () => {
  const quote = rowToQuote({
    basDt: '20260507',
    srtnCd: '005930',
    itmsNm: '삼성전자',
    mrktCtg: 'KOSPI',
    clpr: '266000',
    mkp: '260000',
    hipr: '268000',
    lopr: '258000',
    trqu: '1234567',
    trPrc: '321000000000',
    fltRt: '1.23',
  });

  assert.equal(quote.ticker, '005930');
  assert.equal(quote.price, 266000);
  assert.equal(quote.open, 260000);
  assert.equal(quote.priceType, 'eod');
  assert.equal(quote.source, 'data-go-kr');
  assert.equal(quote.currency, 'KRW');
});
