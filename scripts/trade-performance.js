const { buildTradePerformanceReport } = require('../src/utils/trade-performance');
const { sendTradePerformanceReport } = require('../src/notify/telegram');

function formatKRW(value) {
  if (typeof value !== 'number') return '';
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

async function main() {
  const report = await buildTradePerformanceReport();
  if (report.dataAvailable === false) {
    throw new Error(`실제 거래 저장소 조회 실패: ${report.dataError || 'unknown'}`);
  }
  console.log(`[거래성과] 전체 거래 ${report.totalTrades}건, 평가 가능 매수 ${report.evaluatedBuys}건`);
  console.log(`[거래성과] 평가손익 ${formatKRW(report.totalPnl)} (${report.totalReturnPct ?? 0}%)`);

  if (report.totalTrades > 0) {
    const sent = await sendTradePerformanceReport(report);
    if (!sent) throw new Error('실제 매매 성과 리포트 전송 실패');
  }
}

main().catch(err => {
  console.error('[거래성과] 실패:', err.message);
  process.exit(1);
});
