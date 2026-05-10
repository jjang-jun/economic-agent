const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  normalizeDomesticTicker,
  selectResearchTickers,
  summarizeOhlcv,
} = require('../src/utils/local-research-worker');

const pythonAvailable = spawnSync('python3', ['--version']).status === 0;

test('local backtest worker reports optional provider availability as JSON', { skip: !pythonAvailable }, () => {
  const result = spawnSync('python3', ['scripts/local-backtest-worker.py', 'providers'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.providers.pykrx, 'boolean');
  assert.equal(typeof payload.providers.FinanceDataReader, 'boolean');
  assert.match(payload.usage.ohlcv, /ohlcv/);
});

test('local research helper selects domestic tickers and summarizes OHLCV rows', () => {
  const tickers = selectResearchTickers([
    { ticker: '005930.KS', name: '삼성전자' },
    { symbol: '000660.KQ', name: 'SK하이닉스' },
    { ticker: 'AAPL', name: 'Apple' },
    { ticker: '005930', name: 'duplicate' },
  ], 3);

  assert.equal(normalizeDomesticTicker('005930.KS'), '005930');
  assert.deepEqual(tickers.map(item => item.ticker), ['005930', '000660']);

  const summary = summarizeOhlcv([
    { date: '2026-05-02', close: 95 },
    { date: '2026-05-01', close: 100 },
    { date: '2026-05-03', close: 110 },
  ]);

  assert.equal(summary.rowCount, 3);
  assert.equal(summary.returnPct, 10);
  assert.equal(summary.maxDrawdownPct, -5);
});
