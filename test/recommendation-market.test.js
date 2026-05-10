const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEntryTimingProfile,
  buildFundamentalProfile,
  buildMarketProfile,
} = require('../src/utils/recommendation-market');

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
  }, { revenueGrowthYoYPct: 12 }, { nextDate: '2026-07-16' });

  assert.equal(profile.symbol, 'NFLX');
  assert.equal(profile.marketCapUsd, 375077010000);
  assert.equal(profile.beta, 1.548);
  assert.equal(profile.isActivelyTrading, true);
  assert.equal(profile.statements.revenueGrowthYoYPct, 12);
  assert.equal(profile.earnings.nextDate, '2026-07-16');
  assert.equal(profile.source, 'fmp-profile');
});

test('buildEntryTimingProfile approves breakout or pullback timing only', () => {
  const breakout = buildEntryTimingProfile({
    priceAboveMa5: true,
    priceAboveMa20: true,
    ma5AboveMa20: true,
    ma20Slope5dPct: 1.2,
    distanceFromMa20Pct: 4,
    breakout20d: true,
    volumeRatio20d: 1.4,
  }, { relativeStrength20d: 2 });

  assert.equal(breakout.action, 'breakout');
  assert.equal(breakout.approved, true);

  const weak = buildEntryTimingProfile({
    priceAboveMa5: false,
    priceAboveMa20: false,
    ma5AboveMa20: false,
    ma20Slope5dPct: -0.5,
    distanceFromMa20Pct: -4,
    breakout20d: false,
  }, { relativeStrength20d: -3 });

  assert.equal(weak.action, 'avoid');
  assert.equal(weak.approved, false);
});

test('buildMarketProfile includes moving-average entry timing', () => {
  const profile = buildMarketProfile({
    symbol: '005930.KS',
    name: '삼성전자',
    price: 80000,
    return5dPct: 3,
    return20dPct: 8,
    movingAverage5d: 79000,
    movingAverage20d: 77000,
    distanceFromMa5Pct: 1.27,
    distanceFromMa20Pct: 3.9,
    ma20Slope5dPct: 0.8,
    priceAboveMa5: true,
    priceAboveMa20: true,
    ma5AboveMa20: true,
    volumeRatio20d: 1.3,
    averageTurnover20d: 9000000000,
    near20dHigh: true,
    breakout20d: true,
  }, {
    symbol: '^KS11',
    return5dPct: 1,
    return20dPct: 4,
  });

  assert.equal(profile.name, '삼성전자');
  assert.equal(profile.relativeStrength20d, 4);
  assert.equal(profile.entryTiming.action, 'breakout');
  assert.equal(profile.entryTiming.approved, true);
  assert.equal(profile.liquid, true);
});

test('mergeTechnicalQuote keeps official name when primary quote has no name', () => {
  const { mergeTechnicalQuote } = require('../src/utils/recommendation-market');
  const merged = mergeTechnicalQuote({
    symbol: '011210.KS',
    price: 90500,
    name: '',
    source: 'kis-rest',
  }, {
    symbol: '011210.KS',
    price: 90500,
    name: '현대위아',
    movingAverage20d: 83174,
    high20d: 90500,
    source: 'naver-finance',
  });

  assert.equal(merged.name, '현대위아');
  assert.equal(merged.distanceFromMa20Pct, 8.81);
});
