const { loadRecommendations } = require('../src/utils/recommendation-log');
const { loadPortfolio, enrichPortfolio } = require('../src/utils/portfolio');
const { buildActionReport, saveActionReport } = require('../src/utils/action-report');
const { sendActionReport, formatActionReport } = require('../src/notify/telegram');

function hasFlag(name) {
  return process.argv.includes(name);
}

async function main() {
  const [recommendations, portfolio] = await Promise.all([
    loadRecommendations(),
    enrichPortfolio(loadPortfolio()),
  ]);
  const report = buildActionReport({ recommendations, portfolio });
  const file = saveActionReport(report);

  console.log(`[행동리포트] 저장: ${file}`);
  console.log(`[행동리포트] 신규 ${report.newBuyCandidates.length}건, 관찰 ${report.watchOnlyCandidates.length}건, 보유 ${report.holdCandidates.length}건, 축소 ${report.reduceCandidates.length}건, 매도 ${report.sellCandidates.length}건`);

  if (hasFlag('--noTelegram')) {
    console.log(formatActionReport(report));
    return;
  }

  await sendActionReport(report);
}

main().catch(err => {
  console.error('[행동리포트] 실패:', err.message);
  process.exit(1);
});
