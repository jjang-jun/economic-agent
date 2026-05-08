const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePortfolio } = require('../src/utils/portfolio');

test('normalizePortfolio preserves manual PnL percent override', () => {
  const portfolio = normalizePortfolio({
    positions: [
      {
        name: 'DRAM',
        ticker: 'DRAM',
        quantity: 250,
        avgPrice: 44.28,
        manualPnlPct: 6.8,
      },
    ],
  });

  assert.equal(portfolio.positions[0].manualPnlPct, 6.8);
});

test('normalizePortfolio preserves valuation fields for stored portfolios', () => {
  const portfolio = normalizePortfolio({
    positions: [
      {
        name: 'Netflix',
        ticker: 'NFLX',
        quantity: 22,
        avgPrice: 90.87,
        currentPrice: 87.33,
        marketValue: 2650000,
        costBasis: 2750000,
        unrealizedPnl: -100000,
        unrealizedPnlPct: -3.9,
        priceSource: 'quote',
        quoteSource: 'FMP',
        fxRate: 1390,
      },
    ],
  });

  const position = portfolio.positions[0];
  assert.equal(position.marketValue, 2650000);
  assert.equal(position.costBasis, 2750000);
  assert.equal(position.unrealizedPnl, -100000);
  assert.equal(position.unrealizedPnlPct, -3.9);
  assert.equal(position.priceSource, 'quote');
  assert.equal(position.quoteSource, 'FMP');
  assert.equal(position.fxRate, 1390);
});
