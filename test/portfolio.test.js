const test = require('node:test');
const assert = require('node:assert/strict');
const { enrichPortfolio, normalizePortfolio } = require('../src/utils/portfolio');

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

test('enrichPortfolio preserves manual unrealized PnL amount overrides', async () => {
  const portfolio = await enrichPortfolio({
    cashAmount: 1000000,
    positions: [
      {
        name: 'Netflix',
        ticker: 'NFLX',
        symbol: 'NFLX',
        currency: 'USD',
        quantity: 22,
        avgPrice: 90.87,
        currentPrice: 87.33,
        unrealizedPnl: -156702,
      },
      {
        name: 'DRAM',
        ticker: 'DRAM',
        symbol: 'DRAM',
        currency: 'USD',
        quantity: 200,
        avgPrice: 44.28,
        unrealizedPnl: 2239016,
      },
    ],
  }, {
    fetcher: async symbol => {
      if (symbol === 'KRW=X') return { price: 1400, currency: 'KRW', source: 'test' };
      if (symbol === 'DRAM') return { price: 50, currency: 'USD', source: 'test' };
      return { price: 87.33, currency: 'USD', source: 'test' };
    },
  });

  assert.equal(portfolio.positions[0].currentPrice, 87.33);
  assert.equal(portfolio.positions[0].unrealizedPnl, -156702);
  assert.equal(portfolio.positions[1].unrealizedPnl, 2239016);
  assert.equal(portfolio.unrealizedPnl, 2082314);
});
