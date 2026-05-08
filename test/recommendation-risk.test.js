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

test('normalizeRecommendationRisk caps suggested amount by absolute new-buy limit', () => {
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
      cashAmount: 15000000,
      totalAssetValue: 60000000,
      maxNewBuyRatio: 0.05,
      maxNewBuyAmount: 1000000,
      positions: [],
    },
  });

  assert.equal(risk.suggestedAmount, 1000000);
  assert.equal(risk.positionSize.limits.new_buy_cap, 3000000);
  assert.equal(risk.positionSize.limits.new_buy_amount_cap, 1000000);
});
