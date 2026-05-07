const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFundamentalProfile } = require('../src/utils/recommendation-market');

test('buildFundamentalProfile normalizes FMP profile for risk review', () => {
  const profile = buildFundamentalProfile({
    symbol: 'NFLX',
    companyName: 'Netflix, Inc.',
    sector: 'Communication Services',
    industry: 'Entertainment',
    country: 'US',
    exchange: 'NASDAQ',
    currency: 'USD',
    marketCap: '375077010000',
    beta: '1.548',
    isEtf: false,
    isAdr: false,
    isActivelyTrading: true,
  }, { revenueGrowthYoYPct: 12 });

  assert.equal(profile.symbol, 'NFLX');
  assert.equal(profile.marketCapUsd, 375077010000);
  assert.equal(profile.beta, 1.548);
  assert.equal(profile.isActivelyTrading, true);
  assert.equal(profile.statements.revenueGrowthYoYPct, 12);
  assert.equal(profile.source, 'fmp-profile');
});
