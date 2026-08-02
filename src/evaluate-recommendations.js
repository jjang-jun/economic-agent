const { evaluateRecommendations } = require('./utils/recommendation-log');
const { evaluateResearchCandidates } = require('./utils/research-candidate-log');
const { sendPerformanceReport } = require('./notify/telegram');

async function main() {
  console.log(`[${new Date().toISOString()}] 추천 성과 평가 시작`);

  const result = await evaluateRecommendations();
  console.log(`[성과평가] 전체 추천 ${result.total}건, 신규 평가 ${result.completed.length}건`);

  const researchResult = await evaluateResearchCandidates();
  console.log(`[Shadow 평가] 전체 후보 ${researchResult.total}건, 신규 평가 ${researchResult.completed.length}건`);

  if (result.completed.length > 0) {
    const sent = await sendPerformanceReport(result.completed);
    if (!sent) throw new Error('추천 성과 리포트 전송 실패');
  }

  console.log(`[${new Date().toISOString()}] 추천 성과 평가 완료`);
}

main().catch(err => {
  console.error('[에러]', err);
  process.exit(1);
});
