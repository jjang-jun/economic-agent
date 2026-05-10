const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { authorizeDashboard, buildDashboardHtml } = require('../src/server/dashboard');
const { buildDashboard } = require('../scripts/dashboard');

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
      actionableFailedRuns: 0,
      resolvedFailureRuns: 1,
      successRatePct: 90,
      alertEvents: {
        pendingImmediate: 0,
        pendingDigest: 2,
        actionableFailedImmediate: 0,
        historicalFailedImmediate: 1,
      },
    },
    priceQuality: { totalSnapshots: 12 },
    performanceReview: {
      payload: {
        notes: ['가격 source 품질이 주의 상태입니다.'],
        backtestResearch: {
          enabled: true,
          startDate: '2026-04-10',
          endDate: '2026-05-10',
          provider: 'auto',
          results: [{
            name: 'S-Oil',
            ticker: '010950',
            provider: 'pykrx',
            rowCount: 19,
            returnPct: -3.23,
            maxDrawdownPct: -13.16,
          }],
          failures: [],
        },
      },
    },
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
  assert.match(html, /리뷰 점검 항목/);
  assert.match(html, /조치 필요 실패/);
  assert.match(html, /정리된 과거 실패/);
  assert.match(html, /즉시 알림 실패/);
  assert.match(html, /가격 source 품질이 주의 상태입니다/);
  assert.match(html, /로컬 리서치/);
  assert.match(html, /S-Oil/);
  assert.match(html, /-13.16%/);
  assert.doesNotMatch(html, /차단종목/);
});

test('local dashboard renderer includes review notes and local research sidecar', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'economic-agent-dashboard-'));
  const dataDir = path.join(root, 'supabase');
  const freedomFile = path.join(root, 'freedom-status.json');
  fs.mkdirSync(dataDir, { recursive: true });

  const writeTable = (name, rows) => {
    fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(rows));
  };
  writeTable('articles', []);
  writeTable('recommendations', []);
  writeTable('trade_executions', []);
  writeTable('portfolio_snapshots', []);
  writeTable('investor_flows', []);
  writeTable('recommendation_evaluations', []);
  writeTable('collector_runs', []);
  writeTable('alert_events', []);
  writeTable('price_snapshots', []);
  writeTable('performance_reviews', [{
    created_at: '2026-05-10T00:00:00.000Z',
    payload: {
      notes: ['월간 리서치 worker 결과 확인'],
      backtestResearch: {
        enabled: true,
        startDate: '2026-04-10',
        endDate: '2026-05-10',
        provider: 'auto',
        results: [{
          name: '한화디펜스',
          ticker: '012450',
          provider: 'pykrx',
          rowCount: 19,
          returnPct: -13.27,
          maxDrawdownPct: -14.58,
        }],
        failures: [],
      },
    },
  }]);
  fs.writeFileSync(freedomFile, JSON.stringify({
    targetProgressPct: 2,
    currentNetWorth: 20000000,
    monthlySavingAmount: 3000000,
    goal: { targetNetWorth: 1000000000 },
  }));

  const html = buildDashboard({ dataDir, freedomFile });

  assert.match(html, /Review Notes/);
  assert.match(html, /Actionable Failures/);
  assert.match(html, /Immediate Failures/);
  assert.match(html, /월간 리서치 worker 결과 확인/);
  assert.match(html, /Local Research/);
  assert.match(html, /한화디펜스/);
  assert.match(html, /-14.58%/);
});
