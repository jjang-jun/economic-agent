const { fetchRSSFeeds } = require('./sources/rss-fetcher');
const { filterByKeywords } = require('./filters/keyword-filter');
// 종목 분석은 로컬 스코어러로 충분 (AI는 analyzeStocks에서만 사용)
const { scoreArticles } = require('./filters/local-scorer');
const { analyzeStocks } = require('./analysis/stock-analyzer');
const { sendStockReport } = require('./notify/telegram');
const { fetchAllIndicators } = require('./utils/indicators');
const { saveDailySummary } = require('./utils/daily-summary');
const { archiveScoredArticles, loadScoredArticles } = require('./utils/article-archive');

function mergeArticles(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const article of group) {
      if (article && article.id) byId.set(article.id, article);
    }
  }
  return [...byId.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
    });
}

async function main() {
  console.log(`[${new Date().toISOString()}] 장 마감 종목 분석 시작`);

  const indicators = await fetchAllIndicators();

  const archivedArticles = loadScoredArticles();
  console.log(`[아카이브] 오늘 누적 기사 ${archivedArticles.length}건`);

  // RSS 수집 + 필터링. 아카이브 누락분 보강용이며 seen-articles에 의존하지 않는다.
  const allArticles = await fetchRSSFeeds();
  console.log(`[수집] RSS에서 ${allArticles.length}건 수집`);

  const keywordFiltered = filterByKeywords(allArticles);
  console.log(`[키워드] ${keywordFiltered.length}건 통과`);

  if (keywordFiltered.length === 0 && archivedArticles.length === 0) {
    console.log('[완료] 분석할 기사가 없습니다.');
    return;
  }

  const latestScored = await scoreArticles(keywordFiltered);
  const archived = archiveScoredArticles(latestScored);
  console.log(`[스코어링] 최신 ${latestScored.length}건, 아카이브 신규 ${archived}건`);

  const scored = mergeArticles(loadScoredArticles(), latestScored);
  console.log(`[분석대상] 오늘 누적 중요 기사 ${scored.length}건`);

  if (scored.length === 0) {
    console.log('[완료] 중요 기사가 없어 리포트를 생략합니다.');
    return;
  }

  // AI로 종목 분석 (하루 1회만 AI 사용)
  const report = await analyzeStocks(scored, indicators);
  if (!report) {
    console.error('[완료] 종목 분석 실패');
    return;
  }

  await sendStockReport(report);

  // 일일 요약에 종목 분석 결과 저장
  saveDailySummary({ articles: scored, indicators, stockReport: report });

  console.log(`[${new Date().toISOString()}] 종목 분석 완료`);
}

main().catch(err => {
  console.error('[에러]', err);
  process.exit(1);
});
