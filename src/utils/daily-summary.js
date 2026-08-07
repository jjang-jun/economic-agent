const fs = require('fs');
const path = require('path');

const SUMMARY_DIR = path.join(__dirname, '..', '..', 'data', 'daily-summary');

function getTodayKST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function buildDigestAudit(digest) {
  if (!digest) return null;
  return {
    session: digest.session || '',
    sessionName: digest.sessionName || '',
    headline: digest.headline || '',
    marketMood: digest.market_mood || 'neutral',
    aiMarketMood: digest.marketMoodReview?.aiMood || digest.market_mood || 'neutral',
    marketMoodReview: digest.marketMoodReview || null,
    marketSignal: digest.marketSignal || null,
    capitalFlow: digest.capitalFlow || null,
    sections: digest.sections || [],
    keyNumbers: digest.key_numbers || [],
    watchList: digest.watch_list || [],
    aiMetadata: digest.aiMetadata || null,
    sessionResolution: digest.sessionResolution || null,
    generatedAt: digest.aiMetadata?.generatedAt || new Date().toISOString(),
  };
}

function mergeDigestAudits(current, existing = []) {
  const audits = current ? [current, ...existing] : [...existing];
  const seen = new Set();
  return audits.filter(item => {
    const key = item?.session || item?.sessionName || item?.generatedAt;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function compactSummaryIndicators(indicators = {}) {
  const {
    recentDailySummaries: _recentDailySummaries,
    recentStockReports: _recentStockReports,
    recent_daily_summaries: _recentDailySummariesSnake,
    recent_stock_reports: _recentStockReportsSnake,
    ...currentIndicators
  } = indicators || {};
  return currentIndicators;
}

function saveDailySummary({ articles, indicators, stockReport, digest }) {
  fs.mkdirSync(SUMMARY_DIR, { recursive: true });

  const date = getTodayKST();
  const filePath = path.join(SUMMARY_DIR, `${date}.json`);

  const bullish = articles.filter(a => a.sentiment === 'bullish');
  const bearish = articles.filter(a => a.sentiment === 'bearish');
  const neutral = articles.filter(a => a.sentiment === 'neutral');

  const summary = {
    date,
    stats: {
      total: articles.length,
      bullish: bullish.length,
      bearish: bearish.length,
      neutral: neutral.length,
    },
    indicators: compactSummaryIndicators(indicators),
    topNews: [...articles]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(a => ({
        title: a.titleKo || a.title,
        sentiment: a.sentiment,
        score: a.score,
        reason: a.reason,
        source: a.source,
      })),
    stockReport: stockReport || null,
    digests: mergeDigestAudits(buildDigestAudit(digest)),
  };

  // 같은 날 기존 데이터가 있으면 병합
  try {
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // topNews 병합 (중복 제거 후 상위 10개)
    const allNews = [...summary.topNews, ...(existing.topNews || [])];
    const seen = new Set();
    summary.topNews = allNews.filter(n => {
      if (seen.has(n.title)) return false;
      seen.add(n.title);
      return true;
    }).slice(0, 10);

    // stockReport는 최신 것 사용
    if (!summary.stockReport && existing.stockReport) {
      summary.stockReport = existing.stockReport;
    }
    summary.digests = mergeDigestAudits(buildDigestAudit(digest), existing.digests || []);
  } catch {
    // 파일 없으면 무시
  }

  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
  console.log(`[요약] 일일 요약 저장: ${filePath}`);
  return summary;
}

module.exports = {
  buildDigestAudit,
  compactSummaryIndicators,
  mergeDigestAudits,
  saveDailySummary,
};
