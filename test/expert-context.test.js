const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildExpertContext,
  compactPortfolio,
} = require('../src/agent/expert-context');
const { filterRecentPolicyEvents } = require('../src/utils/policy-event-store');

function portfolio() {
  return {
    capturedAt: '2026-08-05T09:00:00+09:00',
    totalAssetValue: 100_000_000,
    cashAmount: 20_000_000,
    positions: [{ ticker: '005930', name: '삼성전자', marketValue: 80_000_000, weight: 0.8 }],
  };
}

test('real-estate expert loads only its declared portfolio, goal, and policy scopes', async () => {
  const calls = [];
  const context = await buildExpertContext('real_estate', {
    env: {},
    now: '2026-08-05T00:00:00.000Z',
    portfolioLoader: async () => {
      calls.push('portfolio');
      return portfolio();
    },
    recommendationLoader: async () => assert.fail('recommendations are outside real-estate scope'),
    tradeLoader: async () => assert.fail('trades are outside real-estate scope'),
    policyLoader: async options => {
      calls.push(options.domains.join(','));
      return {
        events: [{ title: '주택 공급 정책', domain: 'real_estate', publishedAt: '2026-08-04T00:00:00Z' }],
        source: 'test',
        error: '',
      };
    },
  });

  assert.deepEqual(context.snapshot.scopes, ['portfolio', 'freedom_goal', 'real_estate_policy']);
  assert.equal(calls.filter(item => item === 'portfolio').length, 1);
  assert.ok(calls.includes('real_estate,loan_finance'));
  assert.match(context.contextText, /주택 공급 정책/);
  assert.doesNotMatch(context.contextText, /recommendations/);
});

test('context compaction limits holdings and never invents unavailable numeric values', () => {
  const compacted = compactPortfolio({
    positions: Array.from({ length: 12 }, (_, index) => ({ ticker: String(index), marketValue: index })),
  });
  assert.equal(compacted.positions.length, 8);
  assert.equal(compacted.totalAssetValue, null);
});

test('recent policy filtering respects expert domains and newest-first order', () => {
  const result = filterRecentPolicyEvents([
    { title: 'old home', domain: 'real_estate', publishedAt: '2026-08-01T00:00:00Z' },
    { title: 'tax', domain: 'tax', publishedAt: '2026-08-05T00:00:00Z' },
    { title: 'new home', domains: ['loan_finance'], publishedAt: '2026-08-04T00:00:00Z' },
  ], { domains: ['real_estate', 'loan_finance'], limit: 2 });
  assert.deepEqual(result.map(item => item.title), ['new home', 'old home']);
});
