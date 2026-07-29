const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const {
  classifyMarketStress,
  isMarketStressWindow,
  buildAlertId,
  hasSentEqualOrHigher,
  monitorMarketStress,
} = require('../src/utils/market-stress-monitor');

test('market stress uses staged thresholds before the KRX circuit-breaker level', () => {
  assert.equal(classifyMarketStress(-2.99), null);
  assert.equal(classifyMarketStress(-3).id, 'warning');
  assert.equal(classifyMarketStress(-5).id, 'severe');
  assert.equal(classifyMarketStress(-8).id, 'circuit_breaker');
  assert.equal(classifyMarketStress(-10.84).id, 'circuit_breaker');
});

test('market stress monitoring is limited to the KST regular-market window', () => {
  assert.equal(isMarketStressWindow(new Date('2026-07-29T00:01:00.000Z')), true);
  assert.equal(isMarketStressWindow(new Date('2026-07-29T06:35:00.000Z')), true);
  assert.equal(isMarketStressWindow(new Date('2026-07-29T07:00:00.000Z')), false);
  assert.equal(isMarketStressWindow(new Date('2026-08-01T03:00:00.000Z')), false);
});

test('an equal or more severe alert suppresses later lower-level duplicates', () => {
  const date = '2026-07-29';
  const severeId = buildAlertId(date, '^KS11', 'severe');
  assert.equal(hasSentEqualOrHigher({
    rows: [{ article_id: severeId, status: 'sent' }],
    state: { alerts: [] },
    date,
    symbol: '^KS11',
    level: classifyMarketStress(-3.5),
  }), true);
  assert.equal(hasSentEqualOrHigher({
    rows: [{ article_id: severeId, status: 'sent' }],
    state: { alerts: [] },
    date,
    symbol: '^KS11',
    level: classifyMarketStress(-8.1),
  }), false);
});

test('monitor sends one alert and deduplicates it with local state', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-stress-'));
  const stateFile = path.join(tempDir, 'state.json');
  const messages = [];
  const quoteFetcher = async symbol => ({
    symbol,
    price: symbol === '^KS11' ? 5600 : 700,
    changePercent: symbol === '^KS11' ? -6.8 : -1,
    source: 'test',
    marketTime: '2026-07-29T06:00:00.000Z',
  });
  const options = {
    now: new Date('2026-07-29T06:00:00.000Z'),
    stateFile,
    quoteFetcher,
    alertSender: async message => messages.push(message),
    alertLoader: async () => [],
    alertPersister: async () => ({ saved: 1 }),
    snapshotPersister: async () => ({ saved: 2 }),
  };

  const first = await monitorMarketStress(options);
  const second = await monitorMarketStress(options);

  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /KOSPI 시장 급락 위기/);
});
