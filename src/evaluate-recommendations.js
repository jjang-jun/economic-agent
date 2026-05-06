const { evaluateRecommendations } = require('./utils/recommendation-log');
const { sendPerformanceReport } = require('./notify/telegram');

async function main() {
  console.log(`[${new Date().toISOString()}] 추천 성과 평가 시작`);

  const result = await evaluateRecommendations();
  console.log(`[성과평가] 전체 추천 ${result.total}건, 신규 평가 ${result.completed.length}건`);

  if (result.completed.length > 0) {
    await sendPerformanceReport(result.completed);
  }

  console.log(`[${new Date().toISOString()}] 추천 성과 평가 완료`);
}

main().catch(err => {
  console.error('[에러]', err);
  process.exit(1);
});
