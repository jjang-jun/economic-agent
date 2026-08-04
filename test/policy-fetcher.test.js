const test = require('node:test');
const assert = require('node:assert/strict');
const {
  stripHtml,
  fetchPolicyDocuments,
} = require('../src/sources/policy-fetcher');
const POLICY_SOURCES = require('../src/config/policy-sources');

test('stripHtml normalizes official feed markup and entities', () => {
  assert.equal(stripHtml('<p>ISA &amp; 연금&nbsp; 개편</p>'), 'ISA & 연금 개편');
});

test('policy source catalog uses official RSS endpoints', () => {
  assert.ok(POLICY_SOURCES.length >= 5);
  assert.ok(POLICY_SOURCES.every(source => source.format === 'rss' && source.url.startsWith('https://')));
  assert.ok(POLICY_SOURCES.some(source => source.url === 'https://www.molit.go.kr/dev/board/board_rss.jsp?rss_id=NEWS'));
});

test('fetchPolicyDocuments isolates a failed source and preserves successful documents', async () => {
  const sources = [
    { id: 'ok', authority: '재정경제부', sourceKind: 'official_press', format: 'rss', url: 'https://ok.test/rss' },
    { id: 'fail', authority: '금융위원회', sourceKind: 'official_press', format: 'rss', url: 'https://fail.test/rss' },
  ];
  const parser = {
    async parseString(xml) {
      return { items: [{ guid: xml, title: 'ISA 세제개편안', link: 'https://ok.test/1' }] };
    },
  };
  const fetcher = async url => {
    if (url.includes('fail')) throw new Error('timeout');
    return { ok: true, text: async () => '1' };
  };
  const result = await fetchPolicyDocuments({ sources, parser, fetcher });
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].authority, '재정경제부');
  assert.deepEqual(result.sourceResults.map(item => item.ok), [true, false]);
});
