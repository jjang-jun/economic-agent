const { fetchRSSFeeds } = require('./sources/rss-fetcher');
const { fetchDartDisclosures } = require('./sources/dart-api');
const { filterByKeywords } = require('./filters/keyword-filter');
// 종목 분석은 로컬 스코어러로 충분 (AI는 analyzeStocks에서만 사용)
const { scoreArticles } = require('./filters/local-scorer');
const { analyzeStocks } = require('./analysis/stock-analyzer');
const { sendStockReport } = require('./notify/telegram');
const { fetchAllIndicators } = require('./utils/indicators');
const { saveDailySummary } = require('./utils/daily-summary');
const { archiveScoredArticles, loadScoredArticles } = require('./utils/article-archive');
const { logRecommendations } = require('./utils/recommendation-log');
const { fetchMarketSnapshot } = require('./utils/market-snapshot');
const { buildDecisionContextWithQuotes } = require('./utils/decision-engine');
const { applyRecommendationRisk } = require('./utils/recommendation-risk');
const { applyRecommendationMarketData } = require('./utils/recommendation-market');
const { applyRiskReview } = require('./utils/risk-reviewer');
const { savePortfolioSnapshot } = require('./utils/portfolio');
const {
  persistArticles,
  persistDailySummary,
  persistStockReport,
  persistMarketSnapshots,
  persistInvestorFlow,
  persistPortfolioSnapshot,
  persistDecisionContext,
} = require('./utils/persistence');

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
  indicators.marketSnapshot = await fetchMarketSnapshot('close');
  await persistMarketSnapshots(indicators.marketSnapshot, 'close');
  await persistInvestorFlow(indicators.investorFlow);

  const archivedArticles = loadScoredArticles();
  console.log(`[아카이브] 오늘 누적 기사 ${archivedArticles.length}건`);

  // RSS + DART 수집. 아카이브 누락분 보강용이며 seen-articles에 의존하지 않는다.
  const [rssArticles, dartArticles] = await Promise.all([
    fetchRSSFeeds(),
    fetchDartDisclosures({ days: 1 }),
  ]);
  const allArticles = [...rssArticles, ...dartArticles];
  console.log(`[수집] RSS ${rssArticles.length}건, DART ${dartArticles.length}건`);

  const keywordFiltered = filterByKeywords(allArticles);
  console.log(`[키워드] ${keywordFiltered.length}건 통과`);

  if (keywordFiltered.length === 0 && archivedArticles.length === 0) {
    console.log('[완료] 분석할 기사가 없습니다.');
    return;
  }

  const latestScored = await scoreArticles(keywordFiltered);
  const archived = archiveScoredArticles(latestScored);
  await persistArticles(latestScored);
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
  report.decision = await buildDecisionContextWithQuotes({ articles: scored, indicators });
  if (report.decision.portfolio) {
    savePortfolioSnapshot(report.decision.portfolio);
    await persistPortfolioSnapshot(report.decision.portfolio);
  }
  await applyRecommendationMarketData(report);
  applyRecommendationRisk(report, report.decision);
  applyRiskReview(report, report.decision);
  await persistStockReport(report);
  await persistDecisionContext(report.decision);

  await sendStockReport(report);
  const logged = await logRecommendations(report, { articles: scored, indicators });
  console.log(`[추천로그] 신규 ${logged.added}건, 중복 ${logged.skipped}건`);

  // 일일 요약에 종목 분석 결과 저장
  const summary = saveDailySummary({ articles: scored, indicators, stockReport: report });
  await persistDailySummary(summary);

  console.log(`[${new Date().toISOString()}] 종목 분석 완료`);
}

main().catch(err => {
  console.error('[에러]', err);
  process.exit(1);
});
