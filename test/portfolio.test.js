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
