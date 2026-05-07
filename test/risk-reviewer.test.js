const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewStock } = require('../src/utils/risk-reviewer');

const baseStock = {
  risk_profile: {
    riskReward: 2.5,
    expectedLossPct: 5,
    suggestedAmount: 1000000,
    invalidation: '20일선 이탈',
    tradeable: true,
  },
  market_profile: {
    liquid: true,
    relativeStrength20d: 1,
    near20dHigh: true,
    averageTurnover20d: 10000000000,
  },
};

test('reviewStock blocks inactive FMP profile', () => {
  const review = reviewStock({
    ...baseStock,
    fundamental_profile: {
      source: 'fmp-profile',
      isActivelyTrading: false,
    },
  }, { market: { regime: 'RISK_ON', tags: [] } });

  assert.equal(review.approved, false);
  assert.equal(review.action, 'watch_only');
  assert.ok(review.blockers.some(item => item.includes('active_trading')));
});

test('reviewStock warns on high beta and ADR profile', () => {
  const review = reviewStock({
    ...baseStock,
    fundamental_profile: {
      source: 'fmp-profile',
      isActivelyTrading: true,
      beta: 2.4,
      isAdr: true,
      marketCapUsd: 500000000,
    },
  }, { market: { regime: 'RISK_ON', tags: [] } });

  assert.equal(review.approved, true);
  assert.ok(review.warnings.some(item => item.includes('고베타')));
  assert.ok(review.warnings.some(item => item.includes('ADR')));
  assert.ok(review.warnings.some(item => item.includes('미국 소형주')));
});

test('reviewStock warns on weak financial statement trends', () => {
  const review = reviewStock({
    ...baseStock,
    fundamental_profile: {
      source: 'fmp-profile',
      isActivelyTrading: true,
      statements: {
        revenueGrowthYoYPct: -3,
        netIncomeGrowthYoYPct: -10,
        freeCashFlowMarginPct: -1,
        debtToEquity: 2.5,
      },
    },
  }, { market: { regime: 'RISK_ON', tags: [] } });

  assert.ok(review.warnings.some(item => item.includes('매출 역성장')));
  assert.ok(review.warnings.some(item => item.includes('순이익 감소')));
  assert.ok(review.warnings.some(item => item.includes('FCF 마진 음수')));
  assert.ok(review.warnings.some(item => item.includes('부채비율 주의')));
});
