const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyMarketRegime, detectMarketThemes, scoreMarketRegime } = require('../src/utils/decision-engine');

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

test('detectMarketThemes identifies AI semiconductor cycle from news and global leaders', () => {
  const themes = detectMarketThemes({
    articles: [
      { title: 'AI 데이터센터 수요로 HBM 반도체 투자 확대' },
      { title: 'Micron rallies as DRAM pricing improves' },
    ],
    indicators: {
      marketSnapshot: [
        { symbol: 'SOXX', name: 'Semiconductor ETF', changePercent: 2, return5dPct: 5, return20dPct: 12 },
        { symbol: 'NVDA', name: 'NVIDIA', changePercent: 3, return5dPct: 8, return20dPct: 18 },
        { symbol: 'MU', name: 'Micron Technology', changePercent: 15, return5dPct: 20, return20dPct: 30 },
      ],
    },
  });

  assert.ok(themes.some(theme => theme.id === 'AI_SEMICONDUCTOR_CYCLE'));
  assert.match(themes.find(theme => theme.id === 'AI_SEMICONDUCTOR_CYCLE').playbook.join(' '), /눌림\/분할/);
});

test('scoreMarketRegime surfaces market themes as risk-control tags', () => {
  const result = scoreMarketRegime({
    articles: [
      { sentiment: 'bullish', title: 'AI 데이터센터와 HBM 수요 급증' },
      { sentiment: 'bullish', title: '반도체 장비 투자 확대' },
    ],
    indicators: {
      marketSnapshot: [
        { symbol: '^VIX', name: 'VIX', price: 16 },
        { symbol: 'SOXX', name: 'Semiconductor ETF', changePercent: 2, return5dPct: 5, return20dPct: 12 },
        { symbol: 'NVDA', name: 'NVIDIA', changePercent: 3, return5dPct: 8, return20dPct: 18 },
        { symbol: 'MU', name: 'Micron Technology', changePercent: 15, return5dPct: 20, return20dPct: 30 },
      ],
    },
  });

  assert.ok(result.tags.includes('AI_SEMICONDUCTOR_CYCLE'));
  assert.ok(result.themes.some(theme => theme.id === 'AI_SEMICONDUCTOR_CYCLE'));
  assert.match(result.reasons.join(' '), /AI\/반도체 사이클/);
});
