function normalizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const removable = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'ocid', 'cmpid', 'utm_id', 'utm_name',
      'rss', 'from', 'source', 'ref', 'referrer', 'output',
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

const TITLE_STOPWORDS = new Set([
  '속보', '단독', '종합', '종합2보', '종합보', 'update', 'updated', 'breaking',
  '기자', '뉴스', '오늘', '관련', '공시',
]);

function getTitleTokens(title) {
  return normalizeTitle(title)
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !TITLE_STOPWORDS.has(token));
}

function getTitleSignature(title) {
  const tokens = [...new Set(getTitleTokens(title))]
    .sort()
    .slice(0, 10);
  return tokens.length >= 4 ? tokens.join('|') : '';
}

function jaccardSimilarity(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection++;
  }
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function isSimilarArticle(a, b) {
  if (!a || !b) return false;
  const aDisclosure = a.disclosure?.receiptNo;
  const bDisclosure = b.disclosure?.receiptNo;
  if (aDisclosure && bDisclosure && aDisclosure === bDisclosure) return true;

  const aTitle = normalizeTitle(a.titleKo || a.title);
  const bTitle = normalizeTitle(b.titleKo || b.title);
  if (!aTitle || !bTitle) return false;
  if (aTitle === bTitle) return true;
  if (aTitle.length >= 12 && bTitle.length >= 12 && (aTitle.includes(bTitle) || bTitle.includes(aTitle))) {
    return true;
  }

  const similarity = jaccardSimilarity(getTitleTokens(aTitle), getTitleTokens(bTitle));
  return similarity >= 0.7;
}

function preferArticle(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;
  const candidateScore = [
    candidate.highPriority ? 4 : 0,
    candidate.disclosure ? 3 : 0,
    candidate.summary ? Math.min(String(candidate.summary).length / 100, 2) : 0,
    candidate.link ? 1 : 0,
    Number.isFinite(candidate.score) ? candidate.score / 5 : 0,
  ].reduce((sum, value) => sum + value, 0);
  const currentScore = [
    current.highPriority ? 4 : 0,
    current.disclosure ? 3 : 0,
    current.summary ? Math.min(String(current.summary).length / 100, 2) : 0,
    current.link ? 1 : 0,
    Number.isFinite(current.score) ? current.score / 5 : 0,
  ].reduce((sum, value) => sum + value, 0);
  return candidateScore > currentScore ? candidate : current;
}

function getArticleKeys(article) {
  const keys = [];
  if (article?.id) keys.push(`id:${article.id}`);
  if (article?.disclosure?.receiptNo) keys.push(`dart:${article.disclosure.receiptNo}`);
  const url = normalizeUrl(article?.link);
  if (url) keys.push(`url:${url}`);
  const title = normalizeTitle(article?.titleKo || article?.title);
  if (title && title.length >= 8) keys.push(`title:${title}`);
  const signature = getTitleSignature(article?.titleKo || article?.title);
  if (signature) keys.push(`title-sig:${signature}`);
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
    const duplicateIndex = result.findIndex(existing => {
      const existingKeys = new Set(getArticleKeys(existing));
      return keys.some(key => existingKeys.has(key)) || isSimilarArticle(existing, article);
    });
    if (duplicateIndex >= 0) {
      result[duplicateIndex] = preferArticle(result[duplicateIndex], article);
      for (const key of keys) seen.add(key);
      continue;
    }
    for (const key of keys) seen.add(key);
    result.push(article);
  }
  return result;
}

module.exports = {
  normalizeUrl,
  normalizeTitle,
  getTitleTokens,
  getTitleSignature,
  isSimilarArticle,
  getArticleKeys,
  isSeenArticle,
  markSeenArticle,
  dedupeArticles,
};
