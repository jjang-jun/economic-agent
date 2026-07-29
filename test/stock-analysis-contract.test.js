const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeStocks,
  attachRelatedArticleIds,
  STOCK_ANALYSIS_PROMPT_VERSION,
} = require('../src/analysis/stock-analyzer');
const { getRelatedArticleIds } = require('../src/utils/recommendation-log');

test('stock analysis prompt version advances for current macro risk rules', () => {
  assert.equal(STOCK_ANALYSIS_PROMPT_VERSION, 'stock-analysis-v2.3');
});

test('stock analysis propagates provider failures so workflow cannot report false success', async () => {
  await assert.rejects(
    analyzeStocks([{
      id: 'article-1',
      title: '삼성전자 반도체 투자 확대',
      summary: 'HBM 설비 투자를 확대한다.',
      score: 5,
      pubDate: '2026-07-13T09:00:00+09:00',
    }], {}, {
      chatDetailed: async () => {
        throw new Error('model not found');
      },
    }),
    /model not found/,
  );
});

test('related news indexes resolve against selected analysis articles', () => {
  const report = attachRelatedArticleIds({
    stocks: [
      { name: '삼성전자', related_news: [0, 2, 99] },
    ],
  }, [
    { id: 'selected-a' },
    { id: 'selected-b' },
    { id: 'selected-c' },
  ]);

  assert.deepEqual(report.analysisArticleIds, ['selected-a', 'selected-b', 'selected-c']);
  assert.deepEqual(report.stocks[0].related_article_ids, ['selected-a', 'selected-c']);
  assert.deepEqual(
    getRelatedArticleIds(report.stocks[0], [{ id: 'wrong-full-list-a' }]),
    ['selected-a', 'selected-c']
  );
});
