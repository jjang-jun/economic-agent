const test = require('node:test');
const assert = require('node:assert/strict');
const { buildValuationProfile, applyValuationProfiles } = require('../src/utils/valuation-profile');

test('buildValuationProfile allows insufficient data without blocking', () => {
  const valuation = buildValuationProfile({
    ticker: '005930',
    fundamental_profile: { statements: {} },
  }, {});

  assert.equal(valuation.status, 'insufficient_data');
  assert.equal(valuation.action, 'allow');
  assert.ok(valuation.warnings.some(item => item.includes('데이터 부족')));
});

test('buildValuationProfile blocks expensive stocks with weak fundamentals', () => {
  const valuation = buildValuationProfile({
    ticker: 'HYPE',
    name: 'Hype Software',
    fundamental_profile: {
      sector: 'Technology',
      statements: {
        peRatio: 90,
        priceToSalesRatio: 25,
        revenueGrowthYoYPct: -5,
        netIncomeGrowthYoYPct: -20,
        freeCashFlowMarginPct: -3,
      },
    },
  }, { market: { tags: [] } });

  assert.equal(valuation.status, 'overvalued_block');
  assert.equal(valuation.action, 'block');
  assert.ok(valuation.blockers.some(item => item.includes('비싼 밸류에이션')));
});

test('buildValuationProfile warns but does not block AI semiconductor premium with strong growth', () => {
  const valuation = buildValuationProfile({
    ticker: 'MU',
    name: 'Micron Technology',
    fundamental_profile: {
      industry: 'Semiconductors',
      statements: {
        peRatio: 70,
        priceToSalesRatio: 12,
        revenueGrowthYoYPct: 30,
        netIncomeGrowthYoYPct: 40,
        freeCashFlowMarginPct: 12,
      },
    },
  }, { market: { tags: ['AI_SEMICONDUCTOR_CYCLE'] } });

  assert.equal(valuation.action, 'warn');
  assert.equal(valuation.aiSemiconductorPremium, true);
  assert.ok(valuation.warnings.some(item => item.includes('AI/반도체')));
});

test('applyValuationProfiles attaches valuation profile to report stocks', () => {
  const report = {
    stocks: [
      {
        ticker: 'GOOGL',
        fundamental_profile: {
          sector: 'Communication Services',
          statements: {
            peRatio: 24,
            priceToSalesRatio: 6,
            freeCashFlowYieldPct: 4,
          },
        },
      },
    ],
  };

  applyValuationProfiles(report, { market: { tags: [] } });

  assert.equal(report.stocks[0].valuation_profile.action, 'allow');
  assert.ok(['fair', 'attractive'].includes(report.stocks[0].valuation_profile.status));
});
