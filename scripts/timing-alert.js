const { loadRecommendations } = require('../src/utils/recommendation-log');
const { loadPortfolio, enrichPortfolio } = require('../src/utils/portfolio');
const { loadStoredPortfolio } = require('../src/utils/portfolio-store');
const {
  buildTimingAlertReport,
  filterAlreadyAlerted,
  getTimingSession,
  loadTimingAlertState,
  markTimingAlertsSent,
  saveTimingAlertState,
} = require('../src/utils/timing-alert');
const { sendTimingAlertReport, formatTimingAlertReport } = require('../src/notify/reports');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    mode: 'intraday',
    noReport: false,
    noState: false,
  };

  for (const arg of argv) {
    if (arg === 'premarket' || arg === '--premarket') options.mode = 'premarket';
    else if (arg === 'intraday' || arg === '--intraday') options.mode = 'intraday';
    else if (arg === '--no-report') options.noReport = true;
    else if (arg === '--noState' || arg === '--no-state') options.noState = true;
  }

  return options;
}

function resolveTimingMode(options = {}, env = process.env, now = new Date()) {
  const requestedMode = options.mode || 'intraday';
  const eventName = env.GITHUB_EVENT_NAME || '';
  const scheduled = eventName === 'schedule';
  const { session, clock } = getTimingSession(now);

  if (!scheduled) {
    return {
      mode: requestedMode,
      shouldSend: true,
      requestedMode,
      session,
      clock,
      autoSwitched: false,
    };
  }

  if (requestedMode === 'premarket') {
    if (session === 'premarket') {
      return { mode: 'premarket', shouldSend: true, requestedMode, session, clock, autoSwitched: false };
    }
    if (session === 'intraday') {
      return { mode: 'intraday', shouldSend: true, requestedMode, session, clock, autoSwitched: true };
    }
    return { mode: 'premarket', shouldSend: false, requestedMode, session, clock, autoSwitched: false };
  }

  if (requestedMode === 'intraday' && session !== 'intraday') {
    return { mode: 'intraday', shouldSend: false, requestedMode, session, clock, autoSwitched: false };
  }

  return {
    mode: requestedMode,
    shouldSend: true,
    requestedMode,
    session,
    clock,
    autoSwitched: false,
  };
}

async function main() {
  const options = parseArgs();
  const resolved = resolveTimingMode(options);
  if (!resolved.shouldSend) {
    console.log(`[타이밍알림] ${resolved.requestedMode} 스케줄을 ${resolved.clock.label}에 건너뜀 (session=${resolved.session})`);
    return;
  }
  if (resolved.autoSwitched) {
    console.log(`[타이밍알림] 지연 실행 감지: ${resolved.requestedMode} -> ${resolved.mode} (${resolved.clock.label})`);
  }
  const [recommendations, storedPortfolio] = await Promise.all([
    loadRecommendations(),
    loadStoredPortfolio(),
  ]);
  const portfolio = await enrichPortfolio(storedPortfolio || loadPortfolio());
  const report = await buildTimingAlertReport({
    recommendations,
    portfolio,
    mode: resolved.mode,
  });
  const state = loadTimingAlertState();
  const filteredReport = !options.noState
    ? filterAlreadyAlerted(report, state)
    : report;

  console.log(`[타이밍알림] ${resolved.mode} 후보 ${filteredReport.candidates.length}건`);

  if (options.noReport) {
    console.log(formatTimingAlertReport(filteredReport));
    return;
  }

  if (filteredReport.candidates.length === 0) {
    console.log('[타이밍알림] 신규 승인 후보 없음');
    return;
  }

  const sent = await sendTimingAlertReport(filteredReport);
  if (!sent) throw new Error('타이밍 알림 전송 실패');
  if (!options.noState) {
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
  resolveTimingMode,
};
