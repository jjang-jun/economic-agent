const { loadBuffer, clearBuffer } = require('./utils/article-buffer');
const { dedupeArticles } = require('./utils/article-identity');
const { fetchAllIndicators } = require('./utils/indicators');
const { generateDigest } = require('./analysis/digest');
const { sendDigest } = require('./notify/telegram');
const { saveDailySummary } = require('./utils/daily-summary');
const { archiveScoredArticles } = require('./utils/article-archive');
const { fetchMarketSnapshot } = require('./utils/market-snapshot');
const {
  persistArticles,
  persistDailySummary,
  persistMarketSnapshots,
  persistInvestorFlow,
  loadBufferedDigestArticles,
  persistAlertEvents,
} = require('./utils/persistence');

// 세션 자동 판별 (KST 기준)
function detectSession() {
  const hour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    hour12: false,
  }));

  if (hour < 9) return 'preopen';
  if (hour < 13) return 'midday';
  if (hour < 16) return 'close';
  if (hour < 20) return 'europe';
  return 'usopen';
}

async function main() {
  const session = process.argv[2] || detectSession();
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

  // Telegram 전송
  const sent = await sendDigest(digest);
  if (!sent) {
    console.error('[완료] 다이제스트 전송 실패, 버퍼를 보존합니다.');
    return;
  }

  // 일일 요약 저장
  const summary = saveDailySummary({ articles, indicators });
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
