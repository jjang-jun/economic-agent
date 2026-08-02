const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchNaverQuote } = require('../src/sources/naver-finance');

test('Naver quote keeps daily trading value separate from 20-day average turnover', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        datas: [{
          itemCode: '005930',
          stockName: '삼성전자',
          stockExchangeType: { code: 'KS' },
          closePriceRaw: '80000',
          accumulatedTradingVolumeRaw: '1000000',
          accumulatedTradingValueRaw: '80000000000',
          marketValueFullRaw: '500000000000000',
          localTradedAt: '2026-08-01T15:30:00+09:00',
          isinCode: 'KR7005930003',
          currencyType: { name: 'KRW' },
        }],
      };
    },
  });

  const quote = await fetchNaverQuote('005930');
  assert.equal(quote.tradingValue, 80000000000);
  assert.equal(quote.averageTurnover20d, undefined);
  assert.equal(quote.marketCap, 500000000000000);
  assert.equal(quote.exchange, 'KS');
  assert.equal(quote.isin, 'KR7005930003');
});
