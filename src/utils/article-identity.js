function normalizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const removable = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'ocid', 'cmpid',
    ];
    for (const key of removable) parsed.searchParams.delete(key);
    parsed.hash = '';
    const path = parsed.pathname.replace(/\/$/, '');
    return `${parsed.hostname.toLowerCase()}${path}${parsed.searchParams.toString() ? `?${parsed.searchParams}` : ''}`;
  } catch {
    return String(url).split('#')[0].split('?utm_')[0].trim().toLowerCase();
  }
}

function normalizeTitle(title) {
  return String(title || '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\([^)]*속보[^)]*\)/gi, ' ')
    .replace(/[“”"'‘’`~!@#$%^&*()_=+\-[\]{}|\\;:,.<>/?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getArticleKeys(article) {
  const keys = [];
  if (article?.id) keys.push(`id:${article.id}`);
  const url = normalizeUrl(article?.link);
  if (url) keys.push(`url:${url}`);
  const title = normalizeTitle(article?.titleKo || article?.title);
  if (title && title.length >= 8) keys.push(`title:${title}`);
  return keys;
}

function isSeenArticle(article, seen) {
  return getArticleKeys(article).some(key => seen.has(key) || seen.has(key.replace(/^id:/, '')));
}

function markSeenArticle(article, seen) {
  for (const key of getArticleKeys(article)) {
    seen.add(key);
  }
}

function dedupeArticles(articles) {
  const seen = new Set();
  const result = [];
  for (const article of articles || []) {
    const keys = getArticleKeys(article);
    if (keys.some(key => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    result.push(article);
  }
  return result;
}

module.exports = {
  normalizeUrl,
  normalizeTitle,
  getArticleKeys,
  isSeenArticle,
  markSeenArticle,
  dedupeArticles,
};
