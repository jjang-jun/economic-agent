const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNumber, rowToQuote, eachWeekday } = require('../src/sources/krx-openapi');

test('parseNumber handles KRX formatted numeric values', () => {
  assert.equal(parseNumber('266,000'), 266000);
  assert.equal(parseNumber('-1.23'), -1.23);
  assert.equal(parseNumber('-'), null);
});

test('rowToQuote converts KRX daily trading row to EOD quote', () => {
  const quote = rowToQuote({
    ISU_CD: '005930',
    ISU_NM: '삼성전자',
    TDD_CLSPRC: '266,000',
    TDD_OPNPRC: '260,000',
    TDD_HGPRC: '268,000',
    TDD_LWPRC: '258,000',
    ACC_TRDVOL: '1,234,567',
    ACC_TRDVAL: '321,000,000,000',
    FLUC_RT: '1.23',
    MKTCAP: '1,000,000,000',
    LIST_SHRS: '5,000,000',
  }, { basDd: '20260507', market: 'KOSPI' });

  assert.equal(quote.ticker, '005930');
  assert.equal(quote.name, '삼성전자');
  assert.equal(quote.market, 'KOSPI');
  assert.equal(quote.price, 266000);
  assert.equal(quote.open, 260000);
  assert.equal(quote.high, 268000);
  assert.equal(quote.low, 258000);
  assert.equal(quote.volume, 1234567);
  assert.equal(quote.source, 'krx-openapi');
  assert.equal(quote.priceType, 'eod');
  assert.equal(quote.currency, 'KRW');
});

test('eachWeekday skips weekends in compact date range', () => {
  assert.deepEqual(eachWeekday('2026-05-08', '2026-05-11'), ['20260508', '20260511']);
});
