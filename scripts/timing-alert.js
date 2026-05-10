const { loadRecommendations } = require('../src/utils/recommendation-log');
const { loadPortfolio, enrichPortfolio } = require('../src/utils/portfolio');
const { loadStoredPortfolio } = require('../src/utils/portfolio-store');
const {
  buildTimingAlertReport,
  filterAlreadyAlerted,
  loadTimingAlertState,
  markTimingAlertsSent,
  saveTimingAlertState,
} = require('../src/utils/timing-alert');
const { sendTimingAlertReport, formatTimingAlertReport } = require('../src/notify/telegram');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    mode: 'intraday',
    noTelegram: false,
    noState: false,
  };

  for (const arg of argv) {
    if (arg === 'premarket' || arg === '--premarket') options.mode = 'premarket';
    else if (arg === 'intraday' || arg === '--intraday') options.mode = 'intraday';
    else if (arg === '--noTelegram' || arg === '--no-telegram') options.noTelegram = true;
    else if (arg === '--noState' || arg === '--no-state') options.noState = true;
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const [recommendations, storedPortfolio] = await Promise.all([
    loadRecommendations(),
    loadStoredPortfolio(),
  ]);
  const portfolio = await enrichPortfolio(storedPortfolio || loadPortfolio());
  const report = await buildTimingAlertReport({
    recommendations,
    portfolio,
    mode: options.mode,
  });
  const state = loadTimingAlertState();
  const filteredReport = options.mode === 'intraday' && !options.noState
    ? filterAlreadyAlerted(report, state)
    : report;

  console.log(`[타이밍알림] ${options.mode} 후보 ${filteredReport.candidates.length}건`);

  if (options.noTelegram) {
    console.log(formatTimingAlertReport(filteredReport));
    return;
  }

  if (filteredReport.candidates.length === 0 && options.mode === 'intraday') {
    console.log('[타이밍알림] 장중 신규 조건 충족 후보 없음');
    return;
  }

  await sendTimingAlertReport(filteredReport);
  if (options.mode === 'intraday' && !options.noState) {
    saveTimingAlertState(markTimingAlertsSent(filteredReport, state));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[타이밍알림] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
};
