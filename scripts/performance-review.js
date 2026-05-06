const { buildPerformanceReview, savePerformanceReview } = require('../src/utils/performance-review');
const { sendPerformanceReview } = require('../src/notify/telegram');
const { persistPerformanceReview } = require('../src/utils/persistence');

async function main() {
  const period = process.argv[2] || 'weekly';
  if (!['weekly', 'monthly'].includes(period)) {
    throw new Error('period must be weekly or monthly');
  }

  const review = await buildPerformanceReview(period);
  const file = savePerformanceReview(review);
  await persistPerformanceReview(review);
  console.log(`[성과리뷰] ${period} review saved: ${file}`);
  console.log(`[성과리뷰] 추천 ${review.recommendationSummary.total}건, 거래 ${review.tradeSummary.total}건`);
  await sendPerformanceReview(review);
}

main().catch(err => {
  console.error('[성과리뷰] 실패:', err.message);
  process.exit(1);
});
