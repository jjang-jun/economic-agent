const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateTimeWeightedReturn,
  calculateMoneyWeightedReturn,
  calculateBenchmarkReturn,
  buildPortfolioReturnMetrics,
} = require('../src/utils/portfolio-return');

test('TWR removes external deposits from portfolio performance', () => {
  const snapshots = [
    { capturedAt: '2025-01-01T00:00:00Z', totalAssetValue: 100 },
    { capturedAt: '2026-01-01T00:00:00Z', totalAssetValue: 132 },
  ];
  const flows = [{ occurredAt: '2025-06-01T00:00:00Z', type: 'deposit', amount: 20, external: true }];
  assert.equal(calculateTimeWeightedReturn(snapshots, flows), 12);
});

test('MWR returns annualized XIRR from dated investor cash flows', () => {
  const snapshots = [
    { capturedAt: '2025-01-01T00:00:00Z', totalAssetValue: 100 },
    { capturedAt: '2026-01-01T06:00:00Z', totalAssetValue: 110 },
  ];
  assert.ok(Math.abs(calculateMoneyWeightedReturn(snapshots, []) - 10) < 0.05);
});

test('MWR resolves a steep short-window loss near negative one hundred percent annualized', () => {
  const result = calculateMoneyWeightedReturn([
    { capturedAt: '2026-07-29T00:00:00Z', totalAssetValue: 100 },
    { capturedAt: '2026-08-02T00:00:00Z', totalAssetValue: 82.5 },
  ], []);
  assert.ok(result < -99);
  assert.ok(result >= -100);
});

test('portfolio metrics compare TWR with the same-window benchmark', () => {
  const benchmark = [
    { as_of: '2026-07-01T00:00:00Z', price: 3000 },
    { as_of: '2026-08-01T00:00:00Z', price: 3150 },
  ];
  const metrics = buildPortfolioReturnMetrics({
    snapshots: [
      { capturedAt: '2026-07-01T00:00:00Z', totalAssetValue: 100 },
      { capturedAt: '2026-08-01T00:00:00Z', totalAssetValue: 110 },
    ],
    benchmarkSnapshots: benchmark,
  });
  assert.equal(calculateBenchmarkReturn(benchmark), 5);
  assert.equal(metrics.twrPct, 10);
  assert.equal(metrics.benchmarkReturnPct, 5);
  assert.equal(metrics.excessReturnPct, 5);
});

test('benchmark comparison uses the actual portfolio snapshot window', () => {
  const metrics = buildPortfolioReturnMetrics({
    snapshots: [
      { capturedAt: '2026-07-29T00:00:00Z', totalAssetValue: 100 },
      { capturedAt: '2026-08-01T00:00:00Z', totalAssetValue: 102 },
    ],
    benchmarkSnapshots: [
      { as_of: '2026-07-01T00:00:00Z', price: 2500 },
      { as_of: '2026-07-29T00:00:00Z', price: 3000 },
      { as_of: '2026-08-01T00:00:00Z', price: 3030 },
    ],
  });
  assert.equal(metrics.benchmarkReturnPct, 1);
  assert.equal(metrics.excessReturnPct, 1);
});
