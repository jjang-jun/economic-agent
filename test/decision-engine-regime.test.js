const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyMarketRegime, scoreMarketRegime } = require('../src/utils/decision-engine');

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

test('scoreMarketRegime penalizes commodity stress and weak price reaction', () => {
  const result = scoreMarketRegime({
    articles: [
      { sentiment: 'bullish' },
      { sentiment: 'bullish' },
      { sentiment: 'neutral' },
    ],
    indicators: {
      marketSnapshot: [
        { symbol: '^KS11', name: 'KOSPI', changePercent: -0.8, return20dPct: 2 },
        { symbol: '^KQ11', name: 'KOSDAQ', changePercent: -0.4, return20dPct: 1 },
        { symbol: 'CL=F', name: 'WTI Oil', changePercent: 3.4, return20dPct: 12 },
        { symbol: 'HG=F', name: 'Copper', changePercent: -1.2, return20dPct: -9 },
        { symbol: 'GC=F', name: 'Gold', changePercent: 2.2, return20dPct: 4 },
        { symbol: '^VIX', name: 'VIX', price: 21 },
      ],
    },
  });

  assert.ok(result.score < 0);
  assert.ok(result.tags.includes('NEGATIVE_PRICE_REACTION'));
  assert.ok(result.tags.includes('OIL_SHOCK'));
  assert.ok(result.tags.includes('COPPER_WEAKNESS'));
  assert.ok(result.tags.includes('SAFE_HAVEN_BID'));
  assert.match(result.warnings.join(' '), /WTI 유가 3.4% 급등/);
});

test('scoreMarketRegime rewards resilience when market rises through bad news', () => {
  const result = scoreMarketRegime({
    articles: [
      { sentiment: 'bearish' },
      { sentiment: 'bearish' },
      { sentiment: 'neutral' },
    ],
    indicators: {
      marketSnapshot: [
        { symbol: '^KS11', name: 'KOSPI', changePercent: 0.7, return20dPct: 1 },
        { symbol: '^KQ11', name: 'KOSDAQ', changePercent: 0.5, return20dPct: 1 },
        { symbol: '^VIX', name: 'VIX', price: 17 },
      ],
    },
  });

  assert.ok(result.tags.includes('RESILIENT_PRICE_REACTION'));
  assert.match(result.reasons.join(' '), /악재성 뉴스에도 KOSPI가 0.7% 상승/);
});
