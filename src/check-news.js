const { fetchRSSFeeds } = require('./sources/rss-fetcher');
const { filterByKeywords } = require('./filters/keyword-filter');
const { filterByRelevance } = require('./filters/relevance-matcher');
const { notifyArticles } = require('./notify/telegram');
const { loadSeenArticles, saveSeenArticles } = require('./utils/seen-articles');
const { addToBuffer } = require('./utils/article-buffer');

const { scoreArticles } = require('./filters/local-scorer');

async function main() {
  console.log(`[${new Date().toISOString()}] 뉴스 수집 시작`);

  // 1. RSS 수집
  const allArticles = await fetchRSSFeeds();
  console.log(`[수집] RSS에서 ${allArticles.length}건 수집`);

  // 중복 제거
  const seen = loadSeenArticles();
  const newArticles = allArticles.filter(a => !seen.has(a.id));
  console.log(`[중복제거] 신규 기사 ${newArticles.length}건`);

  if (newArticles.length === 0) {
    console.log('[완료] 새로운 기사가 없습니다.');
    return;
  }

  // 2. 키워드 필터
  const keywordFiltered = filterByKeywords(newArticles);
  console.log(`[키워드] ${keywordFiltered.length}건 통과`);

  if (keywordFiltered.length === 0) {
    for (const a of newArticles) seen.add(a.id);
    saveSeenArticles(seen);
    console.log('[완료] 키워드 매칭 기사가 없습니다.');
    return;
  }

  // 3. 로컬 스코어링 (FinBERT + 키워드 가중치, 무료)
  const scored = await scoreArticles(keywordFiltered);
  console.log(`[스코어링] ${scored.length}건 통과`);

  // 4. 개인 관련성 매칭
  const relevant = filterByRelevance(scored);
  console.log(`[관련성] ${relevant.length}건 최종 대상`);

  // 5. 긴급 기사(5점)는 즉시 알림, 나머지는 버퍼에 저장
  if (relevant.length > 0) {
    const urgent = relevant.filter(a => a.score >= 5);
    const normal = relevant.filter(a => a.score < 5);

    if (urgent.length > 0) {
      const sent = await notifyArticles(urgent);
      console.log(`[긴급알림] ${sent}건 즉시 전송`);
    }

    const added = addToBuffer(normal);
    console.log(`[버퍼] ${added}건 추가 (다이제스트 대기)`);
  }

  // 6. seen 업데이트
  for (const a of newArticles) seen.add(a.id);
  saveSeenArticles(seen);

  console.log(`[${new Date().toISOString()}] 수집 완료`);
}

main().catch(err => {
  console.error('[에러]', err);
  process.exit(1);
});
