const { buildPerformanceReview, savePerformanceReview } = require('../src/utils/performance-review');
const { sendPerformanceReview } = require('../src/notify/reports');
const { persistPerformanceReview } = require('../src/utils/persistence');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    period: 'weekly',
    noReport: false,
    noPersist: false,
    noSave: false,
  };

  for (const arg of argv) {
    if (arg === 'weekly' || arg === 'monthly') {
      options.period = arg;
      continue;
    }
    if (arg === '--no-report') {
      options.noReport = true;
      continue;
    }
    if (arg === '--noPersist' || arg === '--no-persist') {
      options.noPersist = true;
      continue;
    }
    if (arg === '--noSave' || arg === '--no-save') {
      options.noSave = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.noReport = true;
      options.noPersist = true;
      options.noSave = true;
      continue;
    }
  }

  return options;
}

async function main() {
  const { period, noReport, noPersist, noSave } = parseArgs();
  if (!['weekly', 'monthly'].includes(period)) {
    throw new Error('period must be weekly or monthly');
  }

  const review = await buildPerformanceReview(period, {
    saveSideEffects: !noSave,
    persistSideEffects: !noPersist,
  });
  const file = noSave ? null : savePerformanceReview(review);
  if (noPersist) {
    console.log('[성과리뷰] Supabase 저장 생략');
  } else {
    const persisted = await persistPerformanceReview(review);
    if (persisted.error) throw new Error(`Supabase 성과 리뷰 저장 실패: ${persisted.error.message}`);
  }
  if (file) {
    console.log(`[성과리뷰] ${period} review saved: ${file}`);
  } else {
    console.log(`[성과리뷰] ${period} review built without local save`);
  }
  console.log(`[성과리뷰] 추천 ${review.recommendationSummary.total}건, 거래 ${review.tradeSummary.total}건`);
  if (noReport) {
    console.log('[성과리뷰] Discord 전송 생략');
  } else {
    const sent = await sendPerformanceReview(review);
    if (!sent) throw new Error('성과 리뷰 전송 실패');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[성과리뷰] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
};
