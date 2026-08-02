const test = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizeRecommendations,
  summarizeTrades,
  summarizeRecommendationFunnel,
  summarizeRecommendationTracker,
  summarizeResearchCandidates,
  summarizePortfolioPerformance,
} = require('../src/utils/performance-review');

test('recommendation summary preserves unavailable data status', () => {
  const summary = summarizeRecommendations([], {
    dataAvailable: false,
    persistenceAvailable: false,
    dataSource: 'unavailable',
    dataError: '503 schema cache unavailable',
  });

  assert.equal(summary.total, 0);
  assert.equal(summary.dataAvailable, false);
  assert.equal(summary.persistenceAvailable, false);
  assert.equal(summary.dataSource, 'unavailable');
  assert.equal(summary.dataError, '503 schema cache unavailable');
});

test('recommendation tracker separates a working evaluator from missing new approvals', () => {
  const summary = summarizeRecommendationTracker([
    {
      date: '2026-05-07',
      status: 'evaluated',
      evaluations: {
        1: { evaluatedAt: '2026-05-08T08:30:00.000Z' },
        5: { evaluatedAt: '2026-05-14T08:30:00.000Z' },
        20: { evaluatedAt: '2026-06-05T08:30:00.000Z' },
      },
    },
    { date: '2026-05-08', status: 'open', evaluations: {} },
  ]);

  assert.equal(summary.totalStored, 2);
  assert.equal(summary.evaluatedRecommendations, 1);
  assert.equal(summary.fullyEvaluatedRecommendations, 1);
  assert.equal(summary.verifiedCohort, 0);
  assert.equal(summary.verifiedCohort20d, 0);
  assert.equal(summary.pendingRecommendations, 1);
  assert.equal(summary.latestRecommendationDate, '2026-05-08');
  assert.equal(summary.latestVerifiedDate, null);
  assert.equal(summary.latestEvaluationAt, '2026-06-05T08:30:00.000Z');
  assert.deepEqual(summary.byHorizon, { 1: 1, 5: 1, 20: 1 });
  assert.equal(summary.engineHasHistory, true);
});

test('trade summary preserves unavailable data status', () => {
  const summary = summarizeTrades([], [], {
    dataAvailable: false,
    persistenceAvailable: false,
    dataSource: 'unavailable',
    dataError: '503 schema cache unavailable',
  });

  assert.equal(summary.total, 0);
  assert.equal(summary.dataAvailable, false);
  assert.equal(summary.dataError, '503 schema cache unavailable');
});

test('recommendation funnel distinguishes analysis from approved recommendations', () => {
  const summary = summarizeRecommendationFunnel([{ date: '2026-07-31', stocks: [
    { signal: 'bullish', risk_review: { approved: false, action: 'watch_only', blockers: ['market_regime: PANIC'] } },
    { signal: 'neutral', risk_review: { approved: false, action: 'watch_only', blockers: ['liquidity: low'] } },
    { signal: 'bullish', risk_review: { approved: true, action: 'candidate', blockers: [] } },
  ] }]);

  assert.equal(summary.reportDays, 1);
  assert.equal(summary.analyzedCandidates, 3);
  assert.equal(summary.bullishCandidates, 2);
  assert.equal(summary.watchOnlyCandidates, 2);
  assert.equal(summary.approvedCandidates, 1);
  assert.deepEqual(summary.topBlockers, [
    { reason: 'market_regime', count: 1 },
    { reason: 'liquidity', count: 1 },
  ]);
});

test('shadow summary evaluates rejected candidates without promoting them to live recommendations', () => {
  const summary = summarizeResearchCandidates([
    {
      status: 'evaluated',
      rejectionReasons: ['market_regime: RISK_OFF'],
      evaluations: { 20: { signalReturnPct: 5, alphaPct: 2 } },
    },
    {
      status: 'open',
      rejectionReasons: ['entry_timing: wait'],
      evaluations: {},
    },
  ]);

  assert.equal(summary.total, 2);
  assert.equal(summary.evaluated20d, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.winRatePct, 100);
  assert.equal(summary.avgSignalReturnPct, 5);
  assert.deepEqual(summary.topRejectionReasons, [
    { reason: 'market_regime', count: 1 },
    { reason: 'entry_timing', count: 1 },
  ]);
});

test('portfolio performance reports raw asset change and live valuation coverage', () => {
  const summary = summarizePortfolioPerformance({
    dataAvailable: true,
    source: 'supabase_store',
    portfolio: {
      totalAssetValue: 11000000,
      costBasis: 9000000,
      unrealizedPnl: 1000000,
      unrealizedPnlPct: 11.11,
      unclassifiedAssetAmount: 1000000,
      positions: [
        { name: 'A', marketValue: 6000000, weight: 6 / 11, unrealizedPnlPct: 20, priceSource: 'quote' },
        { name: 'B', marketValue: 4000000, weight: 4 / 11, unrealizedPnlPct: -5, priceSource: 'manual' },
      ],
    },
  }, [{ captured_at: '2026-07-02T00:00:00Z', total_asset_value: 10000000 }]);

  assert.equal(summary.rawChangeAmount, 1000000);
  assert.equal(summary.rawChangePct, 10);
  assert.equal(summary.liveValuationCoveragePct, 50);
  assert.equal(summary.unclassifiedAssetAmount, 1000000);
});

test('portfolio performance separates external cash flow from operating return', () => {
  const summary = summarizePortfolioPerformance({
    dataAvailable: true,
    source: 'supabase_store',
    portfolio: {
      totalAssetValue: 12000000,
      capturedAt: '2026-08-01T00:00:00Z',
      positions: [],
    },
  }, [
    { captured_at: '2026-07-01T00:00:00Z', total_asset_value: 10000000 },
  ], {
    cashFlowDataAvailable: true,
    cashFlows: [{
      type: 'deposit', amount: 1000000, externalAmount: 1000000, external: true,
      occurredAt: '2026-07-15T00:00:00Z',
    }],
    benchmarkSnapshots: [
      { as_of: '2026-07-01T00:00:00Z', price: 3000 },
      { as_of: '2026-08-01T00:00:00Z', price: 3030 },
    ],
  });

  assert.equal(summary.rawChangeAmount, 2000000);
  assert.equal(summary.netExternalFlow, 1000000);
  assert.equal(summary.cashFlowAdjustedChangeAmount, 1000000);
  assert.equal(summary.returnMetrics.twrPct, 9.4801);
  assert.equal(summary.returnMetrics.benchmarkReturnPct, 1);
  assert.equal(summary.returnMetrics.excessReturnPct, 8.4801);
});
