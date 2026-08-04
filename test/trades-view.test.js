const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatRecentTradesFromStatus,
  formatTradePerformanceStatus,
} = require('../src/agent/trades-view');

test('recent trades view separates execution, linkage, KRW settlement, and sell reason', () => {
  const message = formatRecentTradesFromStatus({
    dataAvailable: true,
    persistenceAvailable: true,
    trades: [{
      id: 's1', side: 'sell', ticker: 'MU', name: 'Micron', quantity: 1, price: 120,
      currency: 'USD', cashAmountKrw: 168000, realizedPnlKrw: 28000, realizedReturnPct: 20,
      sellReason: '목표가 도달', recommendationId: 'rec-1', recommendationLinkSource: 'auto_ticker_match',
      tradePlanId: 'plan-1', executedAt: '2026-08-04T01:00:00Z',
    }],
  });

  assert.match(message, /최근 실제 체결 기록/);
  assert.match(message, /매도.*Micron/);
  assert.match(message, /원화 168,000원/);
  assert.match(message, /추천\(자동\)·계획 연결/);
  assert.match(message, /실현손익 28,000원 \(20%\)/);
  assert.match(message, /사유 목표가 도달/);
  assert.match(message, /증권사 주문 내역이 아니라/);
});

test('recent trades view does not turn an unavailable store into zero trades', () => {
  const message = formatRecentTradesFromStatus({
    dataAvailable: false,
    error: '503 schema cache unavailable',
    trades: [],
  });
  assert.match(message, /거래 저장소를 읽지 못했습니다/);
  assert.match(message, /0건으로 해석하지 않습니다/);
});

test('trade performance view distinguishes recorded-trade returns from whole-account returns', () => {
  const message = formatTradePerformanceStatus({
    dataAvailable: true,
    totalTrades: 3,
    buyTrades: 2,
    sellTrades: 1,
    evaluatedBuys: 1,
    totalPnl: 50000,
    totalReturnPct: 5,
    realizedPnl: 28000,
    realizedPnlKnown: 1,
    linkedRecommendations: 2,
    sellsWithReason: 1,
    positions: [{ name: 'Micron', quantity: 1, pnl: 50000, returnPct: 5 }],
  });
  assert.match(message, /미실현: 50,000원 \(5%\)/);
  assert.match(message, /매도 실현손익: 28,000원 \(1건\)/);
  assert.match(message, /실제 계좌 전체 성과가 아니라/);
});
