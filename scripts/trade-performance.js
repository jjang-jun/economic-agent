const { buildTradePerformanceReport } = require('../src/utils/trade-performance');
const { sendTradePerformanceReport } = require('../src/notify/telegram');

function formatKRW(value) {
  if (typeof value !== 'number') return '';
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

async function main() {
  const report = await buildTradePerformanceReport();
  console.log(`[거래성과] 전체 거래 ${report.totalTrades}건, 평가 가능 매수 ${report.evaluatedBuys}건`);
  console.log(`[거래성과] 평가손익 ${formatKRW(report.totalPnl)} (${report.totalReturnPct ?? 0}%)`);

  if (report.totalTrades > 0) {
    await sendTradePerformanceReport(report);
  }
}

main().catch(err => {
  console.error('[거래성과] 실패:', err.message);
  process.exit(1);
});
