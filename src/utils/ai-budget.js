const AI_BUDGET = require('../config/ai-budget');

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

function formatMarketSnapshot(snapshot, maxItems) {
  return (snapshot || []).slice(0, maxItems).map(item => {
    const change = typeof item.changePercent === 'number' ? ` (${item.changePercent}%)` : '';
    return `- ${item.name} (${item.symbol}): ${item.price}${change} ${item.currency}`.trim();
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
