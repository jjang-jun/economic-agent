const { loadRecommendations } = require('../src/utils/recommendation-log');
const { loadPortfolio, enrichPortfolio } = require('../src/utils/portfolio');
const { loadStoredPortfolio } = require('../src/utils/portfolio-store');
const { loadScoredArticles, getKSTDate } = require('../src/utils/article-archive');
const { fetchInvestorFlow } = require('../src/sources/naver-investor');
const {
  loadPersistedArticles,
  persistMarketAnomalySignals,
  loadMarketAnomalySignals,
  updateMarketAnomalySignals,
} = require('../src/utils/persistence');
const {
  buildPreNewsSignalReport,
  filterAlreadyAlertedPreNews,
  loadPreNewsSignalState,
  markPreNewsSignalsSent,
  savePreNewsSignalState,
  evaluateSignalFollowUp,
  updateSignalMarketFlow,
  marketFlowContextKey,
} = require('../src/utils/pre-news-signal');
const { sendPreNewsSignalReport, formatPreNewsSignalReport } = require('../src/notify/reports');

function parseArgs(argv = process.argv.slice(2)) {
  return {
    noReport: argv.includes('--no-report'),
    noState: argv.includes('--noState') || argv.includes('--no-state'),
    includeEmpty: argv.includes('--include-empty'),
  };
}

async function main() {
  const options = parseArgs();
  const now = new Date();
  const evidenceLookbackHours = Math.max(1, Number(process.env.PRE_NEWS_EVIDENCE_LOOKBACK_HOURS || 12));
  const followUpHours = Math.max(evidenceLookbackHours, Number(process.env.PRE_NEWS_FOLLOW_UP_HOURS || 24));
  const signalSince = new Date(now.getTime() - followUpHours * 60 * 60 * 1000).toISOString();
  const articleSince = new Date(now.getTime() - (followUpHours + evidenceLookbackHours) * 60 * 60 * 1000).toISOString();
  const [recommendations, storedPortfolio, persistedArticles, recentSignals, investorFlow] = await Promise.all([
    loadRecommendations(),
    loadStoredPortfolio(),
    loadPersistedArticles({ since: articleSince, limit: 500 }),
    loadMarketAnomalySignals({
      since: signalSince,
      limit: 200,
    }),
    fetchInvestorFlow(),
  ]);
  const portfolio = await enrichPortfolio(storedPortfolio || loadPortfolio());
  const localArticles = loadScoredArticles(getKSTDate(now));
  const byId = new Map(localArticles.filter(article => article?.id).map(article => [article.id, article]));
  for (const article of persistedArticles.rows || []) {
    if (article?.id) byId.set(article.id, article);
  }
  const report = await buildPreNewsSignalReport({
    recommendations,
    portfolio,
    now,
    articles: [...byId.values()],
    articleDataAvailable: Array.isArray(persistedArticles.rows) || localArticles.length > 0,
    evidenceLookbackHours,
    investorFlow,
  });
  const persistenceResult = await persistMarketAnomalySignals(report.signals);
  if (persistenceResult.error) {
    throw new Error(`이상징후 저장 실패: ${persistenceResult.error.message}`);
  }
  const unresolvedEvidence = new Set(['evidence_unavailable', 'unexplained_at_detection', 'same_day_time_unverified']);
  const followUps = (recentSignals.rows || [])
    .map(signal => {
      const evidenceUpdated = unresolvedEvidence.has(signal.evidence?.status)
        ? evaluateSignalFollowUp(signal, [...byId.values()], {
            checkedAt: now.toISOString(),
            dataAvailable: report.articleDataAvailable,
          })
        : signal;
      return updateSignalMarketFlow(evidenceUpdated, report.capitalFlow, now.toISOString());
    })
    .filter((signal, index) => {
      const previous = recentSignals.rows[index];
      return signal.evidence?.status !== previous.evidence?.status
        || marketFlowContextKey(signal.marketFlowContext)
          !== marketFlowContextKey(previous.marketFlowContext);
    });
  if (followUps.length > 0) {
    const followUpResult = await updateMarketAnomalySignals(followUps);
    if (followUpResult.error) throw new Error(`이상징후 후속 검증 저장 실패: ${followUpResult.error.message}`);
  }
  const state = loadPreNewsSignalState();
  const filtered = options.noState ? report : filterAlreadyAlertedPreNews(report, state);

  console.log(`[데이터 이상징후] 감시 ${report.universeCount}개, 확인 필요 ${filtered.candidates.length}개, 낮은 강도 관찰 ${report.watch.length}개`);

  if (options.noReport) {
    console.log(formatPreNewsSignalReport(filtered));
    return;
  }

  if (filtered.candidates.length === 0 && !options.includeEmpty) {
    console.log('[데이터 이상징후] 신규 확인 필요 후보 없음');
    return;
  }

  const sent = await sendPreNewsSignalReport(filtered);
  if (!sent) throw new Error('가격·거래량 이상징후 리포트 전송 실패');
  if (!options.noState) {
    savePreNewsSignalState(markPreNewsSignalsSent(filtered, state));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[데이터 이상징후] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
};
