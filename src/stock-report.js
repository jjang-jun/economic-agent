const { fetchRSSFeeds } = require('./sources/rss-fetcher');
const { filterByKeywords } = require('./filters/keyword-filter');
// 종목 분석은 로컬 스코어러로 충분 (AI는 analyzeStocks에서만 사용)
const { scoreArticles } = require('./filters/local-scorer');
const { analyzeStocks } = require('./analysis/stock-analyzer');
const { sendStockReport } = require('./notify/telegram');
const { loadSeenArticles } = require('./utils/seen-articles');
const { fetchAllIndicators } = require('./utils/indicators');
const { saveDailySummary } = require('./utils/daily-summary');

async function main() {
  console.log(`[${new Date().toISOString()}] 장 마감 종목 분석 시작`);

  const indicators = await fetchAllIndicators();

  // RSS 수집 + 필터링
  const allArticles = await fetchRSSFeeds();
  console.log(`[수집] RSS에서 ${allArticles.length}건 수집`);

  const seen = loadSeenArticles();
  const newArticles = allArticles.filter(a => !seen.has(a.id));
  console.log(`[필터] 신규 기사 ${newArticles.length}건`);

  const keywordFiltered = filterByKeywords(newArticles.length > 0 ? newArticles : allArticles);
  console.log(`[키워드] ${keywordFiltered.length}건 통과`);

  if (keywordFiltered.length === 0) {
    console.log('[완료] 분석할 기사가 없습니다.');
    return;
  }

  const scored = await scoreArticles(keywordFiltered);
  console.log(`[스코어링] ${scored.length}건 중요도 4점 이상`);

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
