const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tradePlan = require('../src/utils/trade-plan');
const { formatActionReport } = require('../src/notify/telegram');

test('buildTradePlan creates an open planned trade with target remaining quantity', () => {
  const plan = tradePlan.buildTradePlan({
    side: 'sell',
    ticker: 'DRAM',
    name: 'DRAM ETF',
    quantity: 30,
    plannedDate: '2026-05-11',
    targetRemainingQuantity: 170,
  });

  assert.equal(plan.status, 'open');
  assert.equal(plan.side, 'sell');
  assert.equal(plan.quantity, 30);
  assert.equal(plan.targetRemainingQuantity, 170);
  assert.equal(plan.id, '2026-05-11:sell:DRAM:30');
});

test('markMatchingTradePlanExecuted closes the matching open plan', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-plan-'));
  const originalRead = fs.readFileSync;
  const originalWrite = fs.writeFileSync;
  const originalMkdir = fs.mkdirSync;
  const originalPortfolioFile = process.env.PORTFOLIO_FILE;
  const tempFile = path.join(tempDir, 'trade-plans.json');
  const tempPortfolioFile = path.join(tempDir, 'portfolio.json');

  fs.readFileSync = (file, ...args) => originalRead(file === tradePlan.PLAN_FILE ? tempFile : file, ...args);
  fs.writeFileSync = (file, ...args) => originalWrite(file === tradePlan.PLAN_FILE ? tempFile : file, ...args);
  fs.mkdirSync = (dir, ...args) => originalMkdir(dir === path.dirname(tradePlan.PLAN_FILE) ? tempDir : dir, ...args);
  process.env.PORTFOLIO_FILE = tempPortfolioFile;

  try {
    tradePlan.saveTradePlans([
      tradePlan.buildTradePlan({ side: 'sell', ticker: 'DRAM', quantity: 30, plannedDate: '2026-05-11' }),
    ]);
    const updated = tradePlan.markMatchingTradePlanExecuted({
      id: 'trade-1',
      side: 'sell',
      ticker: 'DRAM',
      quantity: 30,
      executedAt: '2026-05-11T01:00:00.000Z',
    });

    assert.equal(updated.status, 'executed');
    assert.equal(updated.executedTradeId, 'trade-1');
    assert.equal(tradePlan.loadOpenTradePlans({ includeFuture: true, includePortfolio: false }).length, 0);
  } finally {
    fs.readFileSync = originalRead;
    fs.writeFileSync = originalWrite;
    fs.mkdirSync = originalMkdir;
    if (originalPortfolioFile === undefined) delete process.env.PORTFOLIO_FILE;
    else process.env.PORTFOLIO_FILE = originalPortfolioFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('formatActionReport shows planned trades as a separate checklist', () => {
  const message = formatActionReport({
    date: '2026-05-11',
    portfolio: { totalAssetValue: 60000000, cashAmount: 10000000, cashRatio: 0.17, positionCount: 1 },
    newBuyCandidates: [],
    watchOnlyCandidates: [],
    holdCandidates: [],
    reduceCandidates: [],
    sellCandidates: [],
    plannedTrades: [{
      side: 'sell',
      ticker: 'DRAM',
      name: 'DRAM ETF',
      quantity: 30,
      plannedDate: '2026-05-11',
      targetRemainingQuantity: 170,
      notes: '체결 후 포트폴리오 동기화',
    }],
  });

  assert.match(message, /예정 매매 확인/);
  assert.match(message, /2026-05-11 매도 예정/);
  assert.match(message, /DRAM ETF/);
  assert.match(message, /30주/);
  assert.match(message, /목표 잔여 170주/);
});

test('loadOpenTradePlans can include near upcoming plans without showing distant future plans', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-plan-upcoming-'));
  const originalRead = fs.readFileSync;
  const originalWrite = fs.writeFileSync;
  const originalMkdir = fs.mkdirSync;
  const originalPortfolioFile = process.env.PORTFOLIO_FILE;
  const tempFile = path.join(tempDir, 'trade-plans.json');
  const tempPortfolioFile = path.join(tempDir, 'portfolio.json');

  fs.readFileSync = (file, ...args) => originalRead(file === tradePlan.PLAN_FILE ? tempFile : file, ...args);
  fs.writeFileSync = (file, ...args) => originalWrite(file === tradePlan.PLAN_FILE ? tempFile : file, ...args);
  fs.mkdirSync = (dir, ...args) => originalMkdir(dir === path.dirname(tradePlan.PLAN_FILE) ? tempDir : dir, ...args);
  process.env.PORTFOLIO_FILE = tempPortfolioFile;

  try {
    tradePlan.saveTradePlans([
      tradePlan.buildTradePlan({ side: 'sell', ticker: 'DRAM', quantity: 30, plannedDate: '2026-05-11' }),
      tradePlan.buildTradePlan({ side: 'sell', ticker: 'NFLX', quantity: 1, plannedDate: '2026-05-13' }),
    ]);

    const dueOnly = tradePlan.loadOpenTradePlans({
      today: '2026-05-10',
      includePortfolio: false,
    });
    const upcoming = tradePlan.loadOpenTradePlans({
      today: '2026-05-10',
      upcomingDays: 1,
      includePortfolio: false,
    });

    assert.equal(dueOnly.length, 0);
    assert.deepEqual(upcoming.map(plan => plan.ticker), ['DRAM']);
  } finally {
    fs.readFileSync = originalRead;
    fs.writeFileSync = originalWrite;
    fs.mkdirSync = originalMkdir;
    if (originalPortfolioFile === undefined) delete process.env.PORTFOLIO_FILE;
    else process.env.PORTFOLIO_FILE = originalPortfolioFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
