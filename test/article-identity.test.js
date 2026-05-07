const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dedupeArticles,
  getArticleKeys,
  isSimilarArticle,
  normalizeUrl,
} = require('../src/utils/article-identity');

test('normalizeUrl removes tracking parameters', () => {
  assert.equal(
    normalizeUrl('https://example.com/news/1?utm_source=x&ref=telegram&id=7#section'),
    'example.com/news/1?id=7'
  );
});

test('getArticleKeys includes DART receipt identity', () => {
  const keys = getArticleKeys({
    id: 'dart:202605070001',
    title: '[공시] 테스트 공급계약',
    disclosure: { receiptNo: '202605070001' },
  });

  assert.ok(keys.includes('dart:202605070001'));
});

test('isSimilarArticle detects lightly rewritten duplicate headlines', () => {
  const first = { title: '삼성전자, AI 반도체 수요 증가에 강세' };
  const second = { title: '[속보] 삼성전자 AI 반도체 수요 증가로 강세' };

  assert.equal(isSimilarArticle(first, second), true);
});

test('dedupeArticles keeps a single representative for similar articles', () => {
  const articles = [
    { id: 'a', title: 'SK하이닉스, HBM 수요 확대에 신고가', summary: '짧음' },
    { id: 'b', title: 'SK하이닉스 HBM 수요 확대에 신고가 기록', summary: '더 긴 요약입니다. 투자자가 확인해야 할 내용입니다.' },
  ];

  const deduped = dedupeArticles(articles);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, 'b');
});
