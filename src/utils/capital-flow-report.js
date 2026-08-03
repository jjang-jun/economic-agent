function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactFlow(flow = {}) {
  const latest = flow.latest || {};
  const sums5d = flow.sums5d || {};
  if (!latest.date) return null;

  return {
    source: flow.source || '',
    sourceUrl: flow.sourceUrl || '',
    market: flow.market || 'KOSPI',
    unit: flow.unit || '억원',
    date: latest.date,
    latest: {
      foreign: finiteNumber(latest.foreign),
      institution: finiteNumber(latest.institution),
      individual: finiteNumber(latest.individual),
    },
    sums5d: {
      foreign: finiteNumber(sums5d.foreign),
      institution: finiteNumber(sums5d.institution),
      individual: finiteNumber(sums5d.individual),
    },
  };
}

function compactProxyItem(item = {}) {
  return {
    symbol: item.symbol || '',
    name: item.name || item.symbol || '',
    return5dPct: finiteNumber(item.return5dPct),
    volumeRatio20d: finiteNumber(item.volumeRatio20d),
    signal: item.signal || '',
  };
}

function compactCapitalFlowProxy(radar = {}) {
  if (!radar.items?.length) return null;
  return {
    capturedAt: radar.capturedAt || '',
    methodology: radar.methodology || 'price_volume_relative_strength_proxy',
    isActualFundFlow: false,
    coverage: {
      available: finiteNumber(radar.coverage?.available) ?? radar.items.length,
      expected: finiteNumber(radar.coverage?.expected) ?? radar.items.length,
    },
    regime: {
      hint: radar.regime?.hint || 'mixed',
    },
    leaders: (radar.leaders || []).slice(0, 3).map(compactProxyItem),
    laggards: (radar.laggards || []).slice(0, 3).map(compactProxyItem),
  };
}

function buildCapitalFlowSnapshot(indicators = {}) {
  return {
    generatedAt: new Date().toISOString(),
    investorFlow: compactFlow(indicators.investorFlow),
    etfProxy: compactCapitalFlowProxy(indicators.capitalFlowRadar),
  };
}

module.exports = {
  buildCapitalFlowSnapshot,
  compactFlow,
  compactCapitalFlowProxy,
};
