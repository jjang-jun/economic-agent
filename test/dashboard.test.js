const assert = require('node:assert/strict');
const test = require('node:test');
const { authorizeDashboard, buildDashboardHtml } = require('../src/server/dashboard');

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('authorizeDashboard accepts dashboard secret from header', () => {
  const previous = process.env.DASHBOARD_SECRET;
  process.env.DASHBOARD_SECRET = 'secret-123';

  const result = authorizeDashboard(
    { headers: { 'x-dashboard-secret': 'secret-123' } },
    new URL('http://localhost/dashboard')
  );

  restoreEnv('DASHBOARD_SECRET', previous);
  assert.equal(result.ok, true);
});

test('authorizeDashboard rejects missing or wrong secret', () => {
  const previous = process.env.DASHBOARD_SECRET;
  process.env.DASHBOARD_SECRET = 'secret-123';

  const result = authorizeDashboard(
    { headers: { 'x-dashboard-secret': 'wrong' } },
    new URL('http://localhost/dashboard')
  );

  restoreEnv('DASHBOARD_SECRET', previous);
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test('buildDashboardHtml renders freedom and recommendation summary', () => {
  const html = buildDashboardHtml({
    persistenceEnabled: true,
    generatedAt: '2026-05-10T00:00:00.000Z',
    freedom: {
      current_net_worth: 20000000,
      target_net_worth: 1000000000,
      target_progress_pct: 2,
      monthly_saving_amount: 3000000,
      required_annual_return_pct: 10,
    },
    portfolio: {
      total_asset_value: 20000000,
      cash_amount: 15000000,
    },
    evaluations: [
      { signal_return_pct: 2, alpha_pct: 1, max_drawdown_pct: -3 },
      { signal_return_pct: 4, alpha_pct: 2, max_drawdown_pct: -5 },
    ],
    collectorOps: {
      successfulRuns: 9,
      completedRuns: 10,
      failedRuns: 1,
      successRatePct: 90,
      alertEvents: { pendingImmediate: 0, pendingDigest: 2 },
    },
    priceQuality: { totalSnapshots: 12 },
    recommendations: [{
      date: '2026-05-10',
      name: '삼성전자',
      payload: {
        signal: 'bullish',
        entry: { price: 70000, currency: 'KRW' },
        riskProfile: {
          entryReferencePrice: 70000,
          stopLossPrice: 66500,
          riskReward: 2.2,
        },
        riskReview: {
          approved: true,
          action: 'candidate',
          warnings: ['테스트 경고'],
        },
      },
    }, {
      date: '2026-05-10',
      name: '차단종목',
      payload: {
        signal: 'neutral',
        riskProfile: {
          entryReferencePrice: 10000,
          stopLossPrice: 9500,
          riskReward: 0.8,
        },
        riskReview: {
          approved: false,
          action: 'watch_only',
          blockers: ['risk_reward:0.8:1 / min 2:1'],
        },
      },
    }],
  });

  assert.match(html, /Economic Agent Dashboard/);
  assert.match(html, /경제적 자유/);
  assert.match(html, /20,000,000원/);
  assert.match(html, /삼성전자/);
  assert.match(html, /70,000원/);
  assert.match(html, /66,500원/);
  assert.doesNotMatch(html, /차단종목/);
});
