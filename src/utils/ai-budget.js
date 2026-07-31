const AI_BUDGET = require('../config/ai-budget');
const {
  getKstClock,
  inspectSnapshotFreshness,
  selectMarketSnapshotItems,
} = require('./digest-market');

function clip(value, maxChars) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function sortByImportance(articles) {
  return [...articles].sort((a, b) => {
    const aPriority = a.highPriority ? 1 : 0;
    const bPriority = b.highPriority ? 1 : 0;
    if (bPriority !== aPriority) return bPriority - aPriority;
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
  });
}

function selectDigestArticles(articles) {
  return sortByImportance(articles).slice(0, AI_BUDGET.digest.maxArticles);
}

function selectStockReportArticles(articles) {
  return sortByImportance(articles).slice(0, AI_BUDGET.stockReport.maxArticles);
}

function formatDigestArticle(article, index) {
  const sentiment = article.sentiment || 'neutral';
  const sectors = (article.sectors || []).join(', ');
  const title = clip(article.titleKo || article.title, AI_BUDGET.digest.maxTitleChars);
  const source = article.source || '';
  const score = article.score || '';
  return `[${index}] (${sentiment}, score ${score}, ${source}) [${sectors}] ${title}`;
}

function formatStockReportArticle(article, index) {
  const sentiment = article.sentiment || 'neutral';
  const title = clip(article.titleKo || article.title, AI_BUDGET.stockReport.maxTitleChars);
  const reason = clip(article.reason || '', AI_BUDGET.stockReport.maxReasonChars);
  const sectors = (article.sectors || []).join(', ');
  const source = article.source || '';
  return `[${index}] (${sentiment}, score ${article.score}, ${sectors}, ${source}) ${title} — ${reason}`;
}

function formatMarketSnapshot(snapshot, maxItems, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  return selectMarketSnapshotItems(snapshot || [], maxItems).map(item => {
    const change = typeof item.changePercent === 'number' ? ` (${item.changePercent}%)` : '';
    const trend = typeof item.return20dPct === 'number' ? `, 20d ${item.return20dPct}%` : '';
    const freshness = inspectSnapshotFreshness(item, { now });
    const marketClock = item.marketTime ? getKstClock(new Date(item.marketTime)) : null;
    const asOf = marketClock
      ? `, as-of ${marketClock.date} ${String(marketClock.hour).padStart(2, '0')}:${String(marketClock.minute).padStart(2, '0')} KST`
      : ', as-of unknown';
    const freshnessLabel = {
      fresh: 'fresh',
      previous_close: 'previous-close',
      stale: 'STALE-exclude-from-current-mood',
      unknown: 'UNKNOWN-exclude-from-current-mood',
    }[freshness.status];
    return `- ${item.name} (${item.symbol}): ${item.price}${change}${trend} ${item.currency}${asOf}, ${freshnessLabel}`.trim();
  });
}

module.exports = {
  AI_BUDGET,
  clip,
  selectDigestArticles,
  selectStockReportArticles,
  formatDigestArticle,
  formatStockReportArticle,
  formatMarketSnapshot,
};
