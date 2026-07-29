const CAPITAL_FLOW_ETFS = require('../config/capital-flow-etfs');
const { fetchQuote } = require('../sources/yahoo-finance');

function scoreTrend(quote = {}) {
  const return5d = quote.return5dPct;
  const return20d = quote.return20dPct;
  const volumeRatio = quote.volumeRatio20d;
  let score = 0;

  if (typeof return5d === 'number') {
    if (return5d >= 3) score += 2;
    else if (return5d >= 1) score += 1;
    else if (return5d <= -3) score -= 2;
    else if (return5d <= -1) score -= 1;
  }
  if (typeof return20d === 'number') {
    if (return20d >= 5) score += 1;
    else if (return20d <= -5) score -= 1;
  }
  if (typeof volumeRatio === 'number' && volumeRatio >= 1.5 && typeof return5d === 'number') {
    if (return5d > 0) score += 1;
    if (return5d < 0) score -= 1;
  }
  return Math.max(-4, Math.min(4, score));
}

function flowProxyLabel(score) {
  if (score >= 3) return 'strong_inflow_proxy';
  if (score >= 1) return 'inflow_proxy';
  if (score <= -3) return 'strong_outflow_proxy';
  if (score <= -1) return 'outflow_proxy';
  return 'neutral';
}

function summarizeCategory(items = []) {
  const usable = items.filter(item => typeof item.score === 'number');
  if (usable.length === 0) return { count: 0, avgScore: null, signal: 'unknown' };
  const avgScore = Number((usable.reduce((sum, item) => sum + item.score, 0) / usable.length).toFixed(2));
  return {
    count: usable.length,
    avgScore,
    signal: flowProxyLabel(avgScore),
  };
}

function inferRegime(items = []) {
  const risk = items.filter(item => item.role === 'risk');
  const defensive = items.filter(item => item.role === 'defensive');
  const riskOutflows = risk.filter(item => item.score <= -1).length;
  const riskInflows = risk.filter(item => item.score >= 1).length;
  const defensiveInflows = defensive.filter(item => item.score >= 1).length;
  const defensiveOutflows = defensive.filter(item => item.score <= -1).length;

  if (riskOutflows >= 4 && defensiveInflows >= 1) {
    return { hint: 'risk_off', riskOutflows, riskInflows, defensiveInflows, defensiveOutflows };
  }
  if (riskInflows >= 4 && defensiveOutflows >= 1) {
    return { hint: 'risk_on', riskOutflows, riskInflows, defensiveInflows, defensiveOutflows };
  }
  return { hint: 'mixed', riskOutflows, riskInflows, defensiveInflows, defensiveOutflows };
}

function buildCapitalFlowRadar(quotes = [], capturedAt = new Date().toISOString()) {
  const bySymbol = new Map(quotes.filter(Boolean).map(quote => [quote.symbol, quote]));
  const items = CAPITAL_FLOW_ETFS
    .map(instrument => {
      const quote = bySymbol.get(instrument.symbol);
      if (!quote) return null;
      const score = scoreTrend(quote);
      return {
        ...instrument,
        price: quote.price,
        changePercent: quote.changePercent,
        return5dPct: quote.return5dPct,
        return20dPct: quote.return20dPct,
        volumeRatio20d: quote.volumeRatio20d,
        marketTime: quote.marketTime,
        source: quote.source,
        score,
        signal: flowProxyLabel(score),
      };
    })
    .filter(Boolean);
  const categories = {};
  for (const category of [...new Set(items.map(item => item.category))]) {
    categories[category] = summarizeCategory(items.filter(item => item.category === category));
  }
  const sorted = [...items].sort((a, b) => b.score - a.score);

  return {
    capturedAt,
    methodology: 'price_volume_relative_strength_proxy',
    isActualFundFlow: false,
    coverage: {
      expected: CAPITAL_FLOW_ETFS.length,
      available: items.length,
    },
    regime: inferRegime(items),
    leaders: sorted.filter(item => item.score > 0).slice(0, 5),
    laggards: sorted.filter(item => item.score < 0).reverse().slice(0, 5),
    categories,
    items,
  };
}

async function fetchCapitalFlowRadar(options = {}) {
  // The radar needs one consistent history-bearing quote shape. Current-price
  // providers can return realtime quotes without 5d/20d history, so use the
  // Yahoo chart fallback for this low-cost relative-strength proxy.
  const quoteFetcher = options.quoteFetcher || fetchQuote;
  const results = await Promise.allSettled(
    CAPITAL_FLOW_ETFS.map(async instrument => {
      const quote = await quoteFetcher(instrument.symbol);
      return quote ? { ...quote, symbol: instrument.symbol } : null;
    }),
  );
  const quotes = results
    .filter(result => result.status === 'fulfilled' && result.value)
    .map(result => result.value);
  return buildCapitalFlowRadar(quotes, options.capturedAt);
}

function formatCapitalFlowRadar(radar = {}) {
  if (!radar.items?.length) return [];
  const formatItem = item => (
    `${item.name}(${item.symbol}) ${item.signal}, 5d ${item.return5dPct ?? 'n/a'}%, `
    + `20d ${item.return20dPct ?? 'n/a'}%, volume ${item.volumeRatio20d ?? 'n/a'}x`
  );
  return [
    `ETF capital-flow proxy: ${radar.regime?.hint || 'unknown'} `
      + `(coverage ${radar.coverage?.available || 0}/${radar.coverage?.expected || 0}; not actual creations/redemptions)`,
    ...radar.leaders.slice(0, 4).map(item => `- attracting proxy: ${formatItem(item)}`),
    ...radar.laggards.slice(0, 4).map(item => `- leaving proxy: ${formatItem(item)}`),
  ];
}

module.exports = {
  scoreTrend,
  flowProxyLabel,
  summarizeCategory,
  inferRegime,
  buildCapitalFlowRadar,
  fetchCapitalFlowRadar,
  formatCapitalFlowRadar,
};
