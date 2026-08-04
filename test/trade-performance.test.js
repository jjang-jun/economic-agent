const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTradeLedger } = require('../src/utils/trade-performance');

test('buildTradeLedger nets partial sells and calculates realized KRW profit', () => {
  const ledger = buildTradeLedger([
    {
      id: 'b1', executedAt: '2026-08-01T00:00:00Z', side: 'buy', ticker: 'MU', symbol: 'MU',
      name: 'Micron', quantity: 2, price: 100, amount: 200, cashAmountKrw: 280000,
      currency: 'USD', fxRate: 1400, recommendationId: 'rec-1',
    },
    {
      id: 's1', executedAt: '2026-08-02T00:00:00Z', side: 'sell', ticker: 'MU', symbol: 'MU',
      name: 'Micron', quantity: 1, price: 120, amount: 120, cashAmountKrw: 168000,
      currency: 'USD', fxRate: 1400, sellReason: '목표가 도달',
    },
  ]);

  assert.equal(ledger.openPositions.length, 1);
  assert.equal(ledger.openPositions[0].quantity, 1);
  assert.equal(ledger.openPositions[0].costBasisKrw, 140000);
  assert.equal(ledger.realizedSales[0].realizedPnlKrw, 28000);
  assert.equal(ledger.realizedSales[0].realizedReturnPct, 20);
});
