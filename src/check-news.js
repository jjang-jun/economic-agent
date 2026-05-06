const { fetchRSSFeeds } = require('./sources/rss-fetcher');
const { fetchDartDisclosures } = require('./sources/dart-api');
const { filterByKeywords } = require('./filters/keyword-filter');
const { filterByRelevance } = require('./filters/relevance-matcher');
const { notifyArticles } = require('./notify/telegram');
const { loadSeenArticles, saveSeenArticles } = require('./utils/seen-articles');
const { addToBuffer } = require('./utils/article-buffer');
const { archiveScoredArticles } = require('./utils/article-archive');
const { persistArticles } = require('./utils/persistence');
const { dedupeArticles, isSeenArticle, markSeenArticle } = require('./utils/article-identity');

const { scoreArticles } = require('./filters/local-scorer');

async function main() {
  console.log(`[${new Date().toISOString()}] 뉴스 수집 시작`);

  // 1. RSS + DART 공시 수집
  const [rssArticles, dartArticles] = await Promise.all([
    fetchRSSFeeds(),
    fetchDartDisclosures(),
  ]);
  const allArticles = dedupeArticles([...rssArticles, ...dartArticles]);
  console.log(`[수집] RSS ${rssArticles.length}건, DART ${dartArticles.length}건`);

  // 중복 제거
  const seen = loadSeenArticles();
  const newArticles = allArticles.filter(a => !isSeenArticle(a, seen));
  console.log(`[중복제거] 신규 기사 ${newArticles.length}건`);

  if (newArticles.length === 0) {
    console.log('[완료] 새로운 기사가 없습니다.');
    return;
  }

  // 2. 키워드 필터
  const keywordFiltered = filterByKeywords(newArticles);
  console.log(`[키워드] ${keywordFiltered.length}건 통과`);

  if (keywordFiltered.length === 0) {
    for (const a of newArticles) markSeenArticle(a, seen);
    saveSeenArticles(seen);
    console.log('[완료] 키워드 매칭 기사가 없습니다.');
    return;
  }

  // 3. 로컬 스코어링 (FinBERT + 키워드 가중치, 무료)
  const scored = await scoreArticles(keywordFiltered);
  console.log(`[스코어링] ${scored.length}건 통과`);
  const archived = archiveScoredArticles(scored);
  console.log(`[아카이브] 점수화 기사 ${archived}건 신규 저장`);
  await persistArticles(scored);

  // 4. 긴급(5점)은 개인 관련성 필터 후 즉시 알림, 나머지는 버퍼에 저장
  const urgent = filterByRelevance(scored.filter(a => a.score >= 5));
  const normal = scored.filter(a => a.score < 5);

  console.log(`[관련성] 긴급 ${urgent.length}건`);

  if (urgent.length > 0) {
    const sent = await notifyArticles(urgent);
    console.log(`[긴급알림] ${sent}건 즉시 전송`);
  }

  const added = addToBuffer(normal);
  console.log(`[버퍼] ${added}건 추가 (다이제스트 대기)`);

  // 6. seen 업데이트
  for (const a of newArticles) markSeenArticle(a, seen);
  saveSeenArticles(seen);

  console.log(`[${new Date().toISOString()}] 수집 완료`);
}

main().catch(err => {
  console.error('[에러]', err);
  process.exit(1);
});
