const test = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreTrend,
  buildCapitalFlowRadar,
  formatCapitalFlowRadar,
} = require('../src/utils/capital-flow-radar');

function quote(symbol, return5dPct, return20dPct, volumeRatio20d = 1) {
  return {
    symbol,
    price: 100,
    changePercent: 0,
    return5dPct,
    return20dPct,
    volumeRatio20d,
    source: 'test',
  };
}

test('capital-flow score strengthens a trend only when volume confirms it', () => {
  assert.equal(scoreTrend(quote('SPY', 4, 6, 1)), 3);
  assert.equal(scoreTrend(quote('SPY', 4, 6, 1.6)), 4);
  assert.equal(scoreTrend(quote('SPY', -4, -6, 1.6)), -4);
});

test('capital-flow radar marks broad risk weakness plus defensive strength as risk-off', () => {
  const radar = buildCapitalFlowRadar([
    quote('SPY', -4, -6, 1.6),
    quote('QQQ', -5, -8, 1.8),
    quote('IWM', -4, -7, 1.5),
    quote('SOXX', -6, -10, 2),
    quote('EWY', -8, -12, 2),
    quote('TLT', 3, 5, 1.5),
    quote('GLD', 4, 8, 1.5),
  ], '2026-07-29T06:00:00.000Z');

  assert.equal(radar.isActualFundFlow, false);
  assert.equal(radar.regime.hint, 'risk_off');
  assert.equal(radar.leaders[0].role, 'defensive');
  assert.equal(radar.laggards[0].signal, 'strong_outflow_proxy');
  assert.match(formatCapitalFlowRadar(radar)[0], /not actual creations\/redemptions/);
});
