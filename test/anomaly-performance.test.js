const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toEvaluationInput,
  evaluateMarketAnomalySignals,
  buildAnomalyPerformanceSummary,
} = require('../src/utils/anomaly-performance');

function signal(overrides = {}) {
  return {
    id: 'signal-1',
    date: '2026-08-03',
    detectedAt: '2026-08-03T01:00:00.000Z',
    symbol: '005930.KS',
    ticker: '005930',
    name: '삼성전자',
    direction: 'up',
    action: 'pre_news_candidate',
    reasons: ['거래량 1.8배', '20일 고점 돌파'],
    marketProfile: {
      price: 80000,
      currency: 'KRW',
      volumeRatio20d: 1.8,
      breakout20d: true,
      ma5AboveMa20: true,
      relativeStrength20d: 4.2,
    },
    evidence: {
      status: 'related_information_after_signal',
      firstFollowingArticle: { lagMinutes: 45 },
    },
    marketFlowContext: {
      status: 'detection_snapshot',
      alignmentAtDetection: 'market_aligned',
    },
    ...overrides,
  };
}

test('toEvaluationInput preserves point-in-time entry and maps down moves to bearish', () => {
  const input = toEvaluationInput(signal({ direction: 'down' }));
  assert.equal(input.signal, 'bearish');
  assert.equal(input.entry.price, 80000);
  assert.equal(input.entry.marketTime, '2026-08-03T01:00:00.000Z');
});

test('evaluateMarketAnomalySignals stores official 1/5 trading-session results in payload', async () => {
  const stored = signal();
  let persisted = [];
  const result = await evaluateMarketAnomalySignals({
    now: new Date('2026-08-12T00:00:00.000Z'),
    loadSignals: async () => ({ rows: [stored] }),
    fetchQuotes: async (_input, days) => new Map(days.map(day => [day, {
      price: day === 1 ? 81600 : 84000,
      currency: 'KRW',
      source: 'krx-openapi',
      priceType: 'eod',
      evaluationPriceMode: 'official_eod',
      evaluationTargetDate: day === 1 ? '2026-08-04' : '2026-08-10',
      marketTime: day === 1 ? '2026-08-04T06:30:00.000Z' : '2026-08-10T06:30:00.000Z',
      history: [{ date: '2026-08-04T06:30:00.000Z', high: 82000, low: 79000 }],
    }])),
    persistSignals: async items => {
      persisted = items;
      return { rows: items };
    },
  });

  assert.equal(result.completed.length, 2);
  assert.equal(result.changed, 1);
  assert.equal(persisted.length, 1);
  assert.equal(stored.evaluations['1'].signalReturnPct, 2);
  assert.equal(stored.evaluations['5'].signalReturnPct, 5);
  assert.equal(stored.evaluations['1'].priceMode, 'official_eod');
});

test('evaluateMarketAnomalySignals rejects current-price fallback for historical research', async () => {
  const stored = signal();
  let persistCalled = false;
  const result = await evaluateMarketAnomalySignals({
    loadSignals: async () => ({ rows: [stored] }),
    fetchQuotes: async () => new Map([[1, {
      price: 81000,
      evaluationPriceMode: 'current_fallback',
    }]]),
    persistSignals: async () => {
      persistCalled = true;
      return {};
    },
  });
  assert.equal(result.completed.length, 0);
  assert.equal(persistCalled, false);
});

test('buildAnomalyPerformanceSummary separates evidence timing, persistence and research readiness', () => {
  const signals = [
    signal({
      evaluations: {
        1: { signalReturnPct: 2, maxFavorableExcursionPct: 3, maxAdverseExcursionPct: -1 },
        5: { signalReturnPct: 5, maxFavorableExcursionPct: 7, maxAdverseExcursionPct: -2 },
      },
    }),
    signal({
      id: 'signal-2',
      action: 'watch',
      evidence: { status: 'related_information_found', relatedArticles: [{ leadMinutes: 30 }] },
      evaluations: { 1: { signalReturnPct: -1 }, 5: { signalReturnPct: -3 } },
    }),
    signal({
      id: 'signal-3',
      action: 'watch',
      evidence: { status: 'unexplained_at_detection' },
      evaluations: { 1: { signalReturnPct: 0 } },
    }),
  ];
  const summary = buildAnomalyPerformanceSummary(signals);

  assert.equal(summary.total, 3);
  assert.equal(summary.evidenceTiming.articleBeforeSignal, 1);
  assert.equal(summary.evidenceTiming.signalBeforeArticle, 1);
  assert.equal(summary.horizons[1].evaluated, 3);
  assert.equal(summary.horizons[1].hitRatePct, 33.33);
  assert.equal(summary.horizons[5].avgSignalReturnPct, 1);
  assert.equal(summary.nonPersistentWithoutFollowUp, 1);
  assert.equal(summary.readiness.ready, false);
  assert.match(summary.factorCombinations[0].key, /price_move\+volume/);
});
