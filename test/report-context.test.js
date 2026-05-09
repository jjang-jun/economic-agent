const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildReportContext,
  formatDailySummaryContext,
  formatStockReportContext,
} = require('../src/utils/report-context');

test('formatDailySummaryContext compacts stored daily summaries', () => {
  const lines = formatDailySummaryContext([{
    date: '2026-05-09',
    stats: { total: 10, bullish: 3, bearish: 2 },
    topNews: [
      { title: '반도체 수급 개선' },
      { title: '환율 상승 부담' },
    ],
    stockReport: { market_summary: '중립 장세, 신규 매수 제한' },
  }]);

  assert.equal(lines.length, 1);
  assert.match(lines[0], /2026-05-09/);
  assert.match(lines[0], /뉴스 10건/);
  assert.match(lines[0], /시장평: 중립 장세/);
});

test('formatStockReportContext includes regime and candidate actions', () => {
  const lines = formatStockReportContext([{
    date: '2026-05-09',
    market_summary: '반도체 강세지만 과열',
    decision: { market: { regime: 'FRAGILE_RISK_ON' } },
    stocks: [
      { name: '삼성전자', signal: 'bullish', risk_review: { action: 'watch_only' } },
    ],
  }]);

  assert.equal(lines.length, 1);
  assert.match(lines[0], /FRAGILE_RISK_ON/);
  assert.match(lines[0], /삼성전자\/bullish\/watch_only/);
});

test('buildReportContext combines daily summaries and stock reports', () => {
  const lines = buildReportContext({
    dailySummaries: [{ date: '2026-05-09', stats: { total: 1, bullish: 0, bearish: 1 } }],
    stockReports: [{ date: '2026-05-09', market_summary: '위험 관리 우선' }],
  });

  assert.ok(lines.includes('Recent daily summaries:'));
  assert.ok(lines.includes('Recent stock reports:'));
});
