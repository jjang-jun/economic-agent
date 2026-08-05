const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertCompletePortfolioValuation,
  isPlanRelevantToPortfolio,
  shouldSkipReport,
} = require('../scripts/action-report');

test('action report workflow notifies Discord on failure', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'action-report.yml'), 'utf8');

  assert.match(workflow, /name: Build and send action report/);
  assert.match(workflow, /name: Notify Discord on failure/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Action Report \(일일 행동 리포트\)" "Build and send action report"/);
  assert.match(workflow, /GITHUB_RUN_URL:/);
});

test('action report script supports the neutral no-report flag', () => {
  assert.equal(shouldSkipReport(['node', 'scripts/action-report.js', '--no-report']), true);
  assert.equal(shouldSkipReport(['node', 'scripts/action-report.js']), false);
});

test('action report hides stale sell plans for positions no longer held', () => {
  assert.equal(isPlanRelevantToPortfolio(
    { side: 'sell', ticker: 'DRAM', symbol: 'DRAM' },
    { positions: [{ ticker: 'MU', symbol: 'MU' }] },
  ), false);
  assert.equal(isPlanRelevantToPortfolio(
    { side: 'sell', ticker: 'MU', symbol: 'MU' },
    { positions: [{ ticker: 'MU', symbol: 'MU' }] },
  ), true);
  assert.equal(isPlanRelevantToPortfolio(
    { side: 'buy', ticker: 'DRAM', symbol: 'DRAM' },
    { positions: [] },
  ), true);
});

test('action report refuses to synchronize an incomplete portfolio valuation', () => {
  assert.throws(() => assertCompletePortfolioValuation({
    totalAssetValue: 5000000,
    positions: [{ ticker: '005930', name: '삼성전자', marketValue: null }],
  }), /평가액이 없는 종목.*삼성전자/);
  assert.equal(assertCompletePortfolioValuation({
    totalAssetValue: 5000000,
    positions: [{ ticker: '005930', marketValue: 4000000 }],
  }), true);
});
