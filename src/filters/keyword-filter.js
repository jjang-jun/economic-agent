const KEYWORDS = require('../config/keywords');

function filterByKeywords(articles) {
  const passed = [];

  for (const article of articles) {
    const text = `${article.title} ${article.summary}`.toLowerCase();

    // high_priority 키워드가 있으면 즉시 통과 + 우선순위 표시
    const isHighPriority = KEYWORDS.high_priority.some(k => text.includes(k.toLowerCase()));
    if (isHighPriority) {
      article.highPriority = true;
      passed.push(article);
      continue;
    }

    // must_include 키워드 중 하나라도 포함하면 통과
    const hasKeyword = KEYWORDS.must_include.some(k => text.includes(k.toLowerCase()));
    if (hasKeyword) {
      article.highPriority = false;
      passed.push(article);
    }
  }

  return passed;
}

module.exports = { filterByKeywords };
