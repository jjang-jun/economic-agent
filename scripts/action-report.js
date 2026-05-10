const { loadRecommendations } = require('../src/utils/recommendation-log');
const { loadPortfolio, enrichPortfolio } = require('../src/utils/portfolio');
const { loadStoredPortfolio } = require('../src/utils/portfolio-store');
const { buildActionReport, enrichRecommendationsWithLatestPrices, saveActionReport } = require('../src/utils/action-report');
const { loadOpenTradePlans } = require('../src/utils/trade-plan');
const { sendActionReport, formatActionReport } = require('../src/notify/telegram');

function hasFlag(name) {
  return process.argv.includes(name);
}

function shouldSkipTelegram(argv = process.argv) {
  return argv.includes('--noTelegram') || argv.includes('--no-telegram');
}

async function main() {
  const [recommendations, storedPortfolio] = await Promise.all([
    loadRecommendations(),
    loadStoredPortfolio(),
  ]);
  const portfolio = await enrichPortfolio(storedPortfolio || loadPortfolio());
  const enrichedRecommendations = await enrichRecommendationsWithLatestPrices(recommendations, portfolio);
  const report = buildActionReport({
    recommendations: enrichedRecommendations,
    portfolio,
    plannedTrades: loadOpenTradePlans(),
  });
  const file = saveActionReport(report);

  console.log(`[행동리포트] 저장: ${file}`);
  console.log(`[행동리포트] 신규 ${report.newBuyCandidates.length}건, 관찰 ${report.watchOnlyCandidates.length}건, 보유 ${report.holdCandidates.length}건, 축소 ${report.reduceCandidates.length}건, 매도 ${report.sellCandidates.length}건`);

  if (shouldSkipTelegram()) {
    console.log(formatActionReport(report));
    return;
  }

  await sendActionReport(report);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[행동리포트] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = {
  hasFlag,
  shouldSkipTelegram,
};
