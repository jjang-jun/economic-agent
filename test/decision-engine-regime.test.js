const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyMarketRegime } = require('../src/utils/decision-engine');

test('classifyMarketRegime returns detailed risk-on regimes', () => {
  assert.equal(classifyMarketRegime({
    score: 3,
    tags: ['BROAD_RALLY'],
    vixPrice: 16,
  }), 'STRONG_RISK_ON');

  assert.equal(classifyMarketRegime({
    score: 3,
    tags: ['OVERHEATED', 'CONCENTRATED_LEADERSHIP'],
    vixPrice: 17,
  }), 'FRAGILE_RISK_ON');

  assert.equal(classifyMarketRegime({
    score: 2,
    tags: [],
    vixPrice: 18,
  }), 'RISK_ON');
});

test('classifyMarketRegime returns panic for extreme stress', () => {
  assert.equal(classifyMarketRegime({ score: -4, tags: [], vixPrice: 25 }), 'PANIC');
  assert.equal(classifyMarketRegime({ score: -1, tags: [], vixPrice: 36 }), 'PANIC');
  assert.equal(classifyMarketRegime({ score: -2, tags: [], vixPrice: 25 }), 'RISK_OFF');
});
