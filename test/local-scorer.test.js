const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreArticles } = require('../src/filters/local-scorer');

test('scoreArticles adds structured score fields for tradable Korean stock events', async () => {
  const [article] = await scoreArticles([
    {
      id: '1',
      title: '삼성전자 대규모 공급계약 체결',
      summary: 'AI 반도체 HBM 수요 증가에 따른 공급계약 공시',
      pubDate: '2026-05-07T09:00:00+09:00',
      link: 'https://example.com/1',
      source: 'test',
    },
  ]);

  assert.ok(article.score >= 4);
  assert.ok(article.importanceScore >= 4);
  assert.ok(article.tradabilityScore >= 3);
  assert.equal(article.eventType, 'contract');
  assert.ok(article.matchedKeywords.includes('대규모 공급계약'));
});

test('scoreArticles deduplicates similar scored articles', async () => {
  const scored = await scoreArticles([
    {
      id: '1',
      title: '삼성전자, AI 반도체 수요 증가에 강세',
      summary: 'HBM과 데이터센터 수요가 증가했다',
      pubDate: '2026-05-07T09:00:00+09:00',
      link: 'https://example.com/1',
      source: 'test',
    },
    {
      id: '2',
      title: '[속보] 삼성전자 AI 반도체 수요 증가로 강세',
      summary: 'HBM과 데이터센터 수요가 증가했다',
      pubDate: '2026-05-07T09:01:00+09:00',
      link: 'https://example.com/2',
      source: 'test',
    },
  ]);

  assert.equal(scored.length, 1);
});
