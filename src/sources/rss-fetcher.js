const Parser = require('rss-parser');
const { RSS_TIMEOUT_MS } = require('../utils/config');

const RSS_FEEDS = [
  // 국내 경제 뉴스
  {
    name: '연합뉴스',
    url: 'https://www.yna.co.kr/rss/economy.xml',
  },
  {
    name: '매일경제',
    url: 'https://www.mk.co.kr/rss/30100041/',
  },
  {
    name: '한국경제',
    url: 'https://www.hankyung.com/feed/economy',
  },
  // 해외
  {
    name: 'Bloomberg',
    url: 'https://feeds.bloomberg.com/markets/news.rss',
  },
];

async function fetchRSSFeeds() {
  const parser = new Parser({
    timeout: RSS_TIMEOUT_MS,
    headers: {
      'User-Agent': 'economic-agent/1.0',
    },
  });

  // 병렬 fetch
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const result = await parser.parseURL(feed.url);
      return result.items.map(item => ({
        id: item.guid || item.link,
        title: item.title || '',
        summary: item.contentSnippet || item.content || '',
        link: item.link || '',
        pubDate: item.pubDate || new Date().toISOString(),
        source: feed.name,
      }));
    })
  );

  const articles = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    } else {
      console.warn(`[RSS] ${RSS_FEEDS[i].name} 수집 실패: ${result.reason.message}`);
    }
  });

  return articles;
}

module.exports = { fetchRSSFeeds };
