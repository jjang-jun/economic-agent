const { loadBuffer, clearBuffer } = require('./utils/article-buffer');
const { dedupeArticles } = require('./utils/article-identity');
const { fetchAllIndicators } = require('./utils/indicators');
const { generateDigest } = require('./analysis/digest');
const { sendDigest } = require('./notify/telegram');
const { saveDailySummary } = require('./utils/daily-summary');
const { archiveScoredArticles } = require('./utils/article-archive');
const { fetchMarketSnapshot } = require('./utils/market-snapshot');
const {
  detectDigestSession,
  resolveDigestSession,
} = require('./utils/digest-market');
const {
  persistArticles,
  persistDailySummary,
  persistMarketSnapshots,
  persistInvestorFlow,
  loadBufferedDigestArticles,
  persistAlertEvents,
  loadPersistedDailySummaries,
  loadPersistedStockReports,
} = require('./utils/persistence');

// 세션 자동 판별 (KST 기준)
function detectSession() {
  return detectDigestSession();
}

async function main() {
  const requestedSession = process.argv[2] || detectSession();
  const sessionResolution = resolveDigestSession(requestedSession, {
    scheduled: process.env.GITHUB_EVENT_NAME === 'schedule',
  });
  const session = sessionResolution.session;
  if (sessionResolution.adjusted) {
    console.warn(
      `[다이제스트] 예약 세션 조정: ${requestedSession} -> ${session} (${sessionResolution.reason})`
    );
  }
  console.log(`[${new Date().toISOString()}] 다이제스트 생성: ${session}`);

  // 버퍼에 쌓인 기사 가져오기. Cloud Run/Actions 간 상태 공유를 위해
  // Supabase alert_events를 우선하고 로컬 파일 버퍼는 보조로 병합한다.
  const buffered = await loadBufferedDigestArticles({ limit: 100 });
  const supabaseArticles = buffered.rows || [];
  const localArticles = loadBuffer();
  const articles = dedupeArticles([...supabaseArticles, ...localArticles]);
  console.log(`[버퍼] Supabase ${supabaseArticles.length}건, 로컬 ${localArticles.length}건, 병합 ${articles.length}건`);

  if (articles.length === 0) {
    console.log('[완료] 요약할 기사가 없습니다.');
    return;
  }

  // 경제 지표
  const indicators = await fetchAllIndicators();
  indicators.marketSnapshot = await fetchMarketSnapshot(session);
  const [recentDailySummaries, recentStockReports] = await Promise.all([
    loadPersistedDailySummaries({ limit: 2 }),
    loadPersistedStockReports({ limit: 2 }),
  ]);
  indicators.recentDailySummaries = recentDailySummaries.rows || [];
  indicators.recentStockReports = recentStockReports.rows || [];
  archiveScoredArticles(articles);
  await persistArticles(articles);
  await persistMarketSnapshots(indicators.marketSnapshot, session);
  await persistInvestorFlow(indicators.investorFlow);

  // AI로 다이제스트 생성
  const digest = await generateDigest(articles, indicators, session);
  if (!digest) {
    console.error('[완료] 다이제스트 생성 실패, 버퍼를 보존합니다.');
    return;
  }
  digest.sessionResolution = sessionResolution;

  // Telegram 전송
  const sent = await sendDigest(digest);
  if (!sent) {
    throw new Error('다이제스트 전송 실패, 버퍼를 보존합니다.');
  }

  // 일일 요약 저장
  const summary = saveDailySummary({ articles, indicators, digest });
  await persistDailySummary(summary);
  await persistAlertEvents(
    supabaseArticles.map(article => ({
      articleId: article.id,
      alertType: article.alertType || 'digest',
      status: 'sent',
      sentAt: new Date().toISOString(),
      payload: article,
    }))
  );
  clearBuffer();

  console.log(`[${new Date().toISOString()}] 완료`);
}

main().catch(err => {
  console.error('[에러]', err);
  process.exit(1);
});
