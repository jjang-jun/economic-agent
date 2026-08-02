const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPortfolioCashFlow } = require('../src/utils/portfolio-cash-flow');
const { parseArgs } = require('../scripts/record-portfolio-cash-flow');

test('portfolio cash flow classifies only deposits and withdrawals as external by default', () => {
  const deposit = buildPortfolioCashFlow({ type: 'deposit', amount: 1000000, occurredAt: '2026-07-10T00:00:00Z' });
  const withdrawal = buildPortfolioCashFlow({ type: 'withdrawal', amount: 200000, occurredAt: '2026-07-11T00:00:00Z' });
  const dividend = buildPortfolioCashFlow({ type: 'dividend', amount: 50000, occurredAt: '2026-07-12T00:00:00Z' });

  assert.equal(deposit.amount, 1000000);
  assert.equal(deposit.externalAmount, 1000000);
  assert.equal(withdrawal.amount, -200000);
  assert.equal(withdrawal.externalAmount, -200000);
  assert.equal(dividend.amount, 50000);
  assert.equal(dividend.externalAmount, 0);
  assert.equal(dividend.external, false);
});

test('portfolio cash flow CLI parses explicit fields', () => {
  assert.deepEqual(parseArgs([
    '--type', 'deposit', '--amount=1000000', '--occurred-at', '2026-07-10T00:00:00Z', '--notes', 'seed',
  ]), {
    type: 'deposit', amount: '1000000', occurredAt: '2026-07-10T00:00:00Z', notes: 'seed',
  });
});
