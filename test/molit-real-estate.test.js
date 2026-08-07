const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchMolitApartmentData, normalizeRent, normalizeTrade } = require('../src/sources/molit-real-estate');
const { buildAreaMetrics } = require('../src/utils/real-estate-market');
const { collectRealEstate, recentDealMonths } = require('../scripts/collect-real-estate');

const tradeItem = `
  <sggCd>11680</sggCd><umdNm>대치동</umdNm><aptNm>테스트아파트</aptNm><jibun>1</jibun>
  <excluUseAr>84.99</excluUseAr><floor>10</floor><buildYear>2000</buildYear>
  <dealYear>2026</dealYear><dealMonth>8</dealMonth><dealDay>5</dealDay><dealAmount>90,000</dealAmount>
  <dealingGbn>중개거래</dealingGbn>`;

test('MOLIT trade and rent rows normalize 만원 units into KRW', () => {
  const trade = normalizeTrade(tradeItem, '11680');
  assert.equal(trade.price_krw, 900_000_000);
  assert.equal(trade.contract_date, '2026-08-05');
  assert.equal(trade.exclusive_area_sqm, 84.99);

  const rent = normalizeRent(`${tradeItem}<deposit>60,000</deposit><monthlyRent>0</monthlyRent>`, '11680');
  assert.equal(rent.deposit_krw, 600_000_000);
  assert.equal(rent.rent_type, 'jeonse');
});

test('MOLIT fetcher builds official query and parses XML rows', async () => {
  let requested;
  const rows = await fetchMolitApartmentData('trade', {
    serviceKey: 'decoded-key', lawdCode: '11680', dealYmd: '202608',
    fetcher: async url => {
      requested = url;
      return { ok: true, text: async () => `<response><header><resultCode>000</resultCode></header><body><items><item>${tradeItem}</item></items></body></response>` };
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(requested.searchParams.get('LAWD_CD'), '11680');
  assert.equal(requested.searchParams.get('DEAL_YMD'), '202608');
});

test('collector keeps target-band trades, preserves rent context, and dry-run never writes', async () => {
  let writes = 0;
  const result = await collectRealEstate({
    dryRun: true,
    regionCodes: ['11680'],
    months: ['202608'],
    concurrency: 2,
    fetcher: async kind => kind === 'trade'
      ? [normalizeTrade(tradeItem, '11680'), normalizeTrade(tradeItem.replace('90,000', '50,000'), '11680')]
      : [normalizeRent(`${tradeItem}<deposit>60,000</deposit><monthlyRent>0</monthlyRent>`, '11680')],
    upsert: async () => { writes += 1; return { saved: 1 }; },
  });
  assert.equal(result.tradeCount, 1);
  assert.equal(result.rentCount, 1);
  assert.equal(writes, 0);
});

test('daily collector rescans current and previous KST contract months', () => {
  assert.deepEqual(recentDealMonths(new Date('2026-08-06T00:00:00Z'), 2), ['202608', '202607']);
});

test('market metrics distinguish transaction recovery from a guaranteed bottom', () => {
  const july = normalizeTrade(tradeItem.replace('<dealMonth>8</dealMonth>', '<dealMonth>7</dealMonth>').replace('90,000', '91,000'), '11680');
  const august = Array.from({ length: 3 }, (_, index) => normalizeTrade(tradeItem.replace('<floor>10</floor>', `<floor>${index + 1}</floor>`), '11680', index));
  const rent = normalizeRent(`${tradeItem}<deposit>60,000</deposit><monthlyRent>0</monthlyRent>`, '11680');
  const metrics = buildAreaMetrics([july, ...august], [rent], { minPriceKrw: 580_000_000, maxPriceKrw: 950_000_000 });
  const latest = metrics.find(item => item.metric_month === '2026-08-01');
  assert.equal(latest.transaction_count, 3);
  assert.equal(latest.payload.marketPhase, 'TRANSACTION_RECOVERY_WATCH');
  assert.equal(latest.jeonse_ratio, 66.67);
});
