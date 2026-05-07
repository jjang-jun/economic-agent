const fs = require('fs');
const path = require('path');
const { getArticleKeys } = require('./article-identity');

const ARCHIVE_DIR = path.join(__dirname, '..', '..', 'data', 'daily-articles');
const MAX_DAILY_ARTICLES = 1000;

function getKSTDate(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function getArchivePath(date = getKSTDate()) {
  return path.join(ARCHIVE_DIR, `${date}.json`);
}

function loadScoredArticles(date = getKSTDate()) {
  try {
    return JSON.parse(fs.readFileSync(getArchivePath(date), 'utf-8'));
  } catch {
    return [];
  }
}

function normalizeArticle(article) {
  return {
    id: article.id,
    title: article.title,
    titleKo: article.titleKo || '',
    summary: article.summary || '',
    link: article.link || '',
    pubDate: article.pubDate || '',
    pubDatePrecision: article.pubDatePrecision || 'datetime',
    source: article.source || '',
    score: article.score,
    sentiment: article.sentiment || 'neutral',
    finbertConfidence: article.finbertConfidence || null,
    sectors: article.sectors || [],
    reason: article.reason || '',
    highPriority: Boolean(article.highPriority),
    archivedAt: new Date().toISOString(),
  };
}

function saveScoredArticles(articles, date = getKSTDate()) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const normalized = articles
    .filter(a => a && a.id)
    .map(normalizeArticle);

  fs.writeFileSync(getArchivePath(date), JSON.stringify(normalized, null, 2));
}

function archiveScoredArticles(newArticles, date = getKSTDate()) {
  if (!newArticles || newArticles.length === 0) return 0;

  const existing = loadScoredArticles(date);
  const byId = new Map(existing.filter(a => a.id).map(a => [a.id, a]));
  const seenKeys = new Set(existing.flatMap(getArticleKeys));
  let added = 0;

  for (const article of newArticles) {
    if (!article || !article.id) continue;
    const keys = getArticleKeys(article);
    const duplicate = keys.some(key => seenKeys.has(key));
    if (!duplicate) added++;
    for (const key of keys) seenKeys.add(key);
    byId.set(article.id, normalizeArticle(article));
  }

  const merged = [...byId.values()]
    .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    .slice(0, MAX_DAILY_ARTICLES);

  saveScoredArticles(merged, date);
  return added;
}

module.exports = {
  archiveScoredArticles,
  loadScoredArticles,
  saveScoredArticles,
  getKSTDate,
};
