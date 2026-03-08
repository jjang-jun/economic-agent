const MY_INTERESTS = require('../config/interests');

function matchRelevance(article) {
  const tags = [];
  const text = `${article.title} ${article.summary} ${article.reason || ''}`.toLowerCase();

  for (const [category, keywords] of Object.entries(MY_INTERESTS)) {
    if (keywords.some(k => text.includes(k.toLowerCase()))) {
      tags.push(category);
    }
  }

  return tags;
}

function filterByRelevance(articles) {
  return articles
    .map(article => ({
      ...article,
      relevanceTags: matchRelevance(article),
    }))
    .filter(article => article.relevanceTags.length > 0 || article.score >= 5);
  // 5점짜리는 관련성 무관하게 항상 알림
}

module.exports = { matchRelevance, filterByRelevance };
