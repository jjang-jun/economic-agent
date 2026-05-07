const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRecommendationRisk } = require('../src/utils/recommendation-risk');

test('normalizeRecommendationRisk derives entry and stop prices from market profile', () => {
  const risk = normalizeRecommendationRisk({
    ticker: '005930',
    expected_upside_pct: 12,
    expected_loss_pct: 5,
    market_profile: {
      price: 10000,
      liquid: true,
      relativeStrength20d: 1,
      near20dHigh: true,
    },
  }, {
    market: { regime: 'RISK_ON' },
    portfolio: {
      cashAmount: 1000000,
      totalAssetValue: 10000000,
      maxNewBuyRatio: 0.05,
      positions: [],
    },
  });

  assert.equal(risk.entryReferencePrice, 10000);
  assert.equal(risk.stopLossPrice, 9500);
  assert.equal(risk.riskReward, 2.4);
});
