const { loadRecommendations } = require('../src/utils/recommendation-log');
const { loadPortfolio, enrichPortfolio } = require('../src/utils/portfolio');
const { loadStoredPortfolio } = require('../src/utils/portfolio-store');
const {
  buildPreNewsSignalReport,
  filterAlreadyAlertedPreNews,
  loadPreNewsSignalState,
  markPreNewsSignalsSent,
  savePreNewsSignalState,
} = require('../src/utils/pre-news-signal');
const { sendPreNewsSignalReport, formatPreNewsSignalReport } = require('../src/notify/telegram');

function parseArgs(argv = process.argv.slice(2)) {
  return {
    noTelegram: argv.includes('--noTelegram') || argv.includes('--no-telegram'),
    noState: argv.includes('--noState') || argv.includes('--no-state'),
    includeEmpty: argv.includes('--include-empty'),
  };
}

async function main() {
  const options = parseArgs();
  const [recommendations, storedPortfolio] = await Promise.all([
    loadRecommendations(),
    loadStoredPortfolio(),
  ]);
  const portfolio = await enrichPortfolio(storedPortfolio || loadPortfolio());
  const report = await buildPreNewsSignalReport({ recommendations, portfolio });
  const state = loadPreNewsSignalState();
  const filtered = options.noState ? report : filterAlreadyAlertedPreNews(report, state);

  console.log(`[선행신호] 감시 ${report.universeCount}개, 신규 후보 ${filtered.candidates.length}개, 관찰 ${report.watch.length}개`);

  if (options.noTelegram) {
    console.log(formatPreNewsSignalReport(filtered));
    return;
  }

  if (filtered.candidates.length === 0 && !options.includeEmpty) {
    console.log('[선행신호] 신규 선행 후보 없음');
    return;
  }

  await sendPreNewsSignalReport(filtered);
  if (!options.noState) {
    savePreNewsSignalState(markPreNewsSignalsSent(filtered, state));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[선행신호] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
};
