const { evaluateMarketAnomalySignals } = require('../src/utils/anomaly-performance');

async function main() {
  console.log(`[${new Date().toISOString()}] 가격·거래량 이상징후 성과 평가 시작`);
  const result = await evaluateMarketAnomalySignals();
  if (result.disabled) {
    console.log('[이상징후 평가] Supabase 설정이 없어 평가를 건너뜁니다. 신호 0건으로 해석하지 않습니다.');
    return;
  }
  console.log(`[이상징후 평가] 전체 ${result.total}건, 갱신 신호 ${result.changed}건, 신규 1·5거래일 평가 ${result.completed.length}건`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[이상징후 평가] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
