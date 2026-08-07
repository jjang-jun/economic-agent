const test = require('node:test');
const assert = require('node:assert/strict');
const {
  stripHtml,
  normalizeOfficialDetailUrl,
  extractOfficialDetail,
  fetchPolicyEventDetail,
  fetchOfficialResponse,
  fetchSource,
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
  const result = await fetchPolicyDocuments({ sources, parser, fetcher, retryCount: 0 });
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].authority, '재정경제부');
  assert.deepEqual(result.sourceResults.map(item => item.ok), [true, false]);
  assert.equal(result.sourceResults[1].authority, '금융위원회');
});

test('official feed self-redirect reuses the issued WAF cookie once', async () => {
  const calls = [];
  const response = await fetchOfficialResponse(
    { url: 'https://official.test/rss' },
    async (url, options) => {
      calls.push({ url: String(url), options });
      if (calls.length === 1) {
        return {
          status: 307,
          headers: new Headers({
            location: 'https://official.test/rss',
            'set-cookie': 'session=issued; Path=/; HttpOnly',
          }),
        };
      }
      return { status: 200, ok: true };
    },
    5_000
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Cookie, 'session=issued');
});

test('policy source retries a transient timeout before succeeding', async () => {
  let calls = 0;
  const rows = await fetchSource({
    id: 'retry-source',
    format: 'rss',
    url: 'https://official.test/rss',
  }, {
    retryCount: 2,
    retryDelayMs: 0,
    timeoutMs: 5_000,
    fetcher: async () => {
      calls += 1;
      if (calls < 3) throw new Error('transient timeout');
      return { status: 200, ok: true, text: async () => '<rss />' };
    },
    parser: {
      async parseString() {
        return { items: [{ guid: 'recovered', title: '복구 성공' }] };
      },
    },
  });

  assert.equal(calls, 3);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].externalId, 'recovered');
});

test('official detail URL normalizes legacy MOFE links to HTTPS without losing the path', () => {
  assert.equal(
    normalizeOfficialDetailUrl('http://mofe.go.kr/nw/nes/detailNesDtaView.do?searchBbsId=MOSFBBS_1'),
    'https://www.mofe.go.kr/nw/nes/detailNesDtaView.do?searchBbsId=MOSFBBS_1'
  );
});

test('FSC official page detail extractor keeps the article body and excludes attachments', () => {
  const html = `
    <div class="board-view-wrap">
      <div class="cont"><p>정부는 생산적 금융 확대를 위해 제도를 개편합니다.</p><p>적용 대상과 시행 시기는 후속 법령에서 확정됩니다.</p></div>
      <div class="file">첨부파일.pdf</div>
    </div>`;
  const detail = extractOfficialDetail(html, {
    link: 'https://www.fsc.go.kr/no010102/87480',
    title: '생산적 금융 확대 방안',
  });
  assert.match(detail, /정부는 생산적 금융 확대/);
  assert.match(detail, /후속 법령에서 확정/);
  assert.doesNotMatch(detail, /첨부파일/);
});

test('policy detail enrichment fails soft and preserves RSS identity', async () => {
  const original = {
    title: '금융 정책 발표',
    summary: '',
    link: 'https://www.fsc.go.kr/no010102/87480',
    contentHash: 'rss-hash',
  };
  const enriched = await fetchPolicyEventDetail(original, {
    fetcher: async () => ({
      ok: true,
      status: 200,
      text: async () => '<div class="cont"><p>금융소비자 보호를 강화하고 적용 대상은 시행령에서 정합니다. 구체적인 신청 절차와 시행일은 후속 공고에서 안내합니다.</p></div><div class="file"></div>',
    }),
  });
  assert.equal(enriched.contentHash, 'rss-hash');
  assert.equal(enriched.detailSource, 'official_page');
  assert.match(enriched.summary, /금융소비자 보호/);

  const preserved = await fetchPolicyEventDetail(original, {
    fetcher: async () => { throw new Error('temporary timeout'); },
  });
  assert.deepEqual(preserved, original);

  const normalizedOnly = await fetchPolicyEventDetail({
    ...original,
    link: 'http://mofe.go.kr/nw/nes/detailNesDtaView.do?id=1',
  });
  assert.equal(normalizedOnly.link, 'https://www.mofe.go.kr/nw/nes/detailNesDtaView.do?id=1');
});
