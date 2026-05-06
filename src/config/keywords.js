const market = require('./market-keywords');
const stock = require('./stock-keywords');
const disclosure = require('./disclosure-keywords');

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function mergeWeight(...groups) {
  const merged = {};
  for (const group of groups) {
    for (const [weight, keywords] of Object.entries(group.weight || {})) {
      merged[weight] = unique([...(merged[weight] || []), ...keywords]);
    }
  }
  return merged;
}

function mergeSentiment(...groups) {
  return {
    bullish: unique(groups.flatMap(group => group.sentiment?.bullish || [])),
    bearish: unique(groups.flatMap(group => group.sentiment?.bearish || [])),
  };
}

function mergeSectors(...groups) {
  const sectors = {};
  for (const group of groups) {
    for (const [sector, keywords] of Object.entries(group.sectors || {})) {
      sectors[sector] = unique([...(sectors[sector] || []), ...keywords]);
    }
  }
  return sectors;
}

const GROUPS = { market, stock, disclosure };

const KEYWORDS = {
  groups: GROUPS,
  must_include: unique([
    ...market.must_include,
    ...stock.must_include,
    ...disclosure.must_include,
  ]),
  high_priority: unique([
    ...market.high_priority,
    ...stock.high_priority,
    ...disclosure.high_priority,
  ]),
  weight: mergeWeight(market, stock, disclosure),
  sentiment: mergeSentiment(market, stock, disclosure),
  sectors: mergeSectors(market, stock, disclosure),
};

module.exports = KEYWORDS;
