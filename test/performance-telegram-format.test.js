const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPerformanceReport, formatTradePerformanceReport } = require('../src/notify/telegram');

test('formatPerformanceReport does not render NaN for empty evaluations', () => {
  const message = formatPerformanceReport([]);

  assert.match(message, /평균 방향 반영 수익률: <b>데이터 부족<\/b>/);
  assert.match(message, /아직 평가 완료된 추천이 없습니다/);
  assert.doesNotMatch(message, /NaN/);
});

test('formatPerformanceReport shows sample count for average return', () => {
  const message = formatPerformanceReport([
    {
      recommendation: { name: 'A', ticker: 'AAA', signal: 'bullish', conviction: 'high' },
      day: 5,
      evaluation: { returnPct: 4, signalReturnPct: 4, alphaPct: 1 },
    },
    {
      recommendation: { name: 'B', ticker: 'BBB', signal: 'bearish', conviction: 'medium' },
      day: 5,
      evaluation: { returnPct: -1, signalReturnPct: 1 },
    },
  ]);

  assert.match(message, /평균 방향 반영 수익률: <b>2.50% \(2건\)<\/b>/);
});

test('formatTradePerformanceReport does not turn missing evaluation into zero percent', () => {
  const message = formatTradePerformanceReport({
    totalTrades: 1,
    buyTrades: 1,
    sellTrades: 0,
    linkedRecommendations: 0,
    evaluatedBuys: 0,
    positions: [],
  });

  assert.match(message, /평가손익: 데이터 부족/);
  assert.doesNotMatch(message, /\(0%\)/);
});

