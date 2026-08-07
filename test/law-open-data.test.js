const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLawSearchUrl,
  parseLawRows,
  compactDate,
  lawStage,
  lawDocument,
  fetchLawPolicyDocuments,
} = require('../src/sources/law-open-data');
const { assemblyBillDocument } = require('../src/sources/assembly-bills');
const { classifyPolicyDocument } = require('../src/utils/policy-classifier');

function row(overrides = {}) {
  return {
    법령ID: '001584',
    법령일련번호: '261001',
    법령명한글: '조세특례제한법',
    공포일자: '20260807',
    공포번호: '22001',
    시행일자: '20260901',
    제개정구분명: '일부개정',
    소관부처명: '재정경제부',
    법령상세링크: '/법령/조세특례제한법',
    ...overrides,
  };
}

test('law search URL follows the official current-law JSON contract', () => {
  const url = buildLawSearchUrl('조세특례제한법', { oc: 'not-a-real-oc' });
  assert.equal(url.origin + url.pathname, 'https://www.law.go.kr/DRF/lawSearch.do');
  assert.equal(url.searchParams.get('target'), 'law');
  assert.equal(url.searchParams.get('type'), 'JSON');
  assert.equal(url.searchParams.get('query'), '조세특례제한법');
});

test('law response parser accepts one or many official law rows', () => {
  assert.deepEqual(parseLawRows({ LawSearch: { law: row() } }), [row()]);
  assert.deepEqual(parseLawRows({ LawSearch: { law: [row(), row({ 법령ID: '2' })] } }).length, 2);
  assert.throws(() => parseLawRows({ LawSearch: { resultCode: '99', resultMsg: '오류' } }), /99: 오류/);
});

test('law metadata distinguishes promulgation from effective status', () => {
  assert.equal(compactDate('20260807'), '2026-08-07');
  assert.equal(lawStage('2026-09-01', new Date('2026-08-07T00:00:00Z')), 'promulgated');
  assert.equal(lawStage('2026-08-01', new Date('2026-08-07T00:00:00Z')), 'effective');
  const document = lawDocument(row(), { now: new Date('2026-08-07T00:00:00Z') });
  assert.equal(document.stage, 'promulgated');
  assert.equal(document.policyGroupTitle, '조세특례제한법');
  assert.equal(document.statute.effectiveDate, '2026-09-01');
  assert.match(document.link, /^https:\/\/www\.law\.go\.kr\//);
});

test('law source stays disabled until the separately approved OC is configured', async () => {
  const result = await fetchLawPolicyDocuments({ oc: '' });
  assert.equal(result.skipped, true);
  assert.deepEqual(result.sourceResults, []);
});

test('law source keeps exact law-name matches and isolates term failures', async () => {
  const result = await fetchLawPolicyDocuments({
    oc: 'not-a-real-oc',
    terms: ['조세특례제한법', '실패법'],
    now: new Date('2026-08-07T00:00:00Z'),
    fetcher: async url => {
      if (url.searchParams.get('query') === '실패법') throw new Error('timeout');
      return {
        ok: true,
        json: async () => ({ LawSearch: { law: [row(), row({ 법령ID: 'other', 법령명한글: '조세특례제한법 시행령' })] } }),
      };
    },
  });
  assert.equal(result.documents.length, 1);
  assert.equal(result.sourceResults[0].ok, true);
  assert.match(result.sourceResults[0].error, /실패법: timeout/);
});

test('an amended bill and its current statute share one policy event group', () => {
  const bill = classifyPolicyDocument(assemblyBillDocument({
    BILL_ID: 'PRC_TEST', BILL_NAME: '조세특례제한법 일부개정법률안',
    PROPOSER: '정부', PROPOSER_KIND: '정부', PROPOSE_DT: '2026-08-01',
  }));
  const statute = classifyPolicyDocument(lawDocument(row(), {
    now: new Date('2026-08-07T00:00:00Z'),
  }));
  assert.equal(bill.eventKey, statute.eventKey);
  assert.notEqual(bill.id, statute.id);
});
