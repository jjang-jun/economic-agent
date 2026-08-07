const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAssemblyBillUrl,
  parseAssemblyTotalCount,
  parseAssemblyRows,
  assemblyBillDocument,
  isImportantAssemblyBill,
  fetchAssemblyPolicyDocuments,
} = require('../src/sources/assembly-bills');

function row(overrides = {}) {
  return {
    BILL_ID: 'PRC_TEST',
    BILL_NO: '2200001',
    AGE: '22',
    BILL_NAME: '조세특례제한법 일부개정법률안',
    PROPOSER: '정부',
    PROPOSER_KIND: '정부',
    PROPOSE_DT: '2026-08-01',
    CURR_COMMITTEE: '기획재정위원회',
    LINK_URL: 'https://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_TEST',
    ...overrides,
  };
}

test('assembly bill URL uses the replacement search API and current National Assembly age', () => {
  const url = buildAssemblyBillUrl('조세특례제한법', {
    apiKey: 'not-a-real-key', age: 22, pageSize: 50,
  });
  assert.equal(url.origin + url.pathname, 'https://open.assembly.go.kr/portal/openapi/TVBPMBILL11');
  assert.equal(url.searchParams.get('AGE'), '22');
  assert.equal(url.searchParams.get('BILL_NAME'), '조세특례제한법');
  assert.equal(url.searchParams.get('Type'), 'json');
});

test('assembly response parser reads rows and rejects official API errors', () => {
  assert.deepEqual(parseAssemblyRows({
    TVBPMBILL11: [
      { head: [{ list_total_count: 1 }, { RESULT: { CODE: 'INFO-000', MESSAGE: '정상' } }] },
      { row: [row()] },
    ],
  }), [row()]);
  assert.throws(
    () => parseAssemblyRows({ RESULT: { CODE: 'ERROR-290', MESSAGE: '인증키 오류' } }),
    /ERROR-290/
  );
  assert.equal(parseAssemblyTotalCount({
    TVBPMBILL11: [{ head: [{ list_total_count: 123 }] }],
  }), 123);
});

test('assembly bill maps committee, plenary and promulgation states without guessing', () => {
  const submitted = assemblyBillDocument(row());
  assert.equal(submitted.stage, 'submitted');
  assert.match(submitted.summary, /기획재정위원회/);
  assert.equal(submitted.legislative.billNo, '2200001');

  const passed = assemblyBillDocument(row({ PROC_DT: '2026-08-05', PROC_RESULT_CD: '수정가결' }));
  assert.equal(passed.stage, 'passed');

  const promulgated = assemblyBillDocument(row({
    PROM_DT: '2026-08-07', PROM_LAW_NM: '조세특례제한법', PROM_NO: '22001',
  }));
  assert.equal(promulgated.stage, 'promulgated');
  assert.equal(promulgated.pubDate, '2026-08-07');
});

test('assembly importance gate keeps government bills and legally advanced member bills', () => {
  const governmentDraft = assemblyBillDocument(row());
  const memberDraft = assemblyBillDocument(row({ PROPOSER: '홍길동의원', PROPOSER_KIND: '의원' }));
  const memberPassed = assemblyBillDocument(row({
    PROPOSER: '홍길동의원', PROPOSER_KIND: '의원',
    PROC_DT: '2026-08-05', PROC_RESULT_CD: '수정가결',
  }));
  assert.equal(isImportantAssemblyBill(governmentDraft), true);
  assert.equal(isImportantAssemblyBill(memberDraft), false);
  assert.equal(isImportantAssemblyBill(memberPassed), true);
  assert.equal(isImportantAssemblyBill(memberDraft, { includeMemberSubmitted: true }), true);
});

test('assembly source is disabled cleanly without its separate API key', async () => {
  const result = await fetchAssemblyPolicyDocuments({ apiKey: '' });
  assert.equal(result.skipped, true);
  assert.deepEqual(result.documents, []);
  assert.deepEqual(result.sourceResults, []);
});

test('assembly source isolates a failed bill term and deduplicates successful bills', async () => {
  const payload = {
    TVBPMBILL11: [
      { head: [{ list_total_count: 1 }, { RESULT: { CODE: 'INFO-000', MESSAGE: '정상' } }] },
      { row: [row()] },
    ],
  };
  const result = await fetchAssemblyPolicyDocuments({
    apiKey: 'not-a-real-key',
    terms: ['조세특례제한법', '실패법'],
    fetcher: async url => {
      if (url.searchParams.get('BILL_NAME') === '실패법') throw new Error('timeout');
      return { ok: true, json: async () => payload };
    },
  });
  assert.equal(result.skipped, false);
  assert.equal(result.documents.length, 1);
  assert.equal(result.sourceResults[0].ok, true);
  assert.equal(result.sourceResults[0].fetchedCount, 1);
  assert.match(result.sourceResults[0].error, /실패법: timeout/);
});

test('assembly source follows every result page for a bill term', async () => {
  const requestedPages = [];
  const result = await fetchAssemblyPolicyDocuments({
    apiKey: 'not-a-real-key',
    terms: ['조세특례제한법'],
    pageSize: 1,
    fetcher: async url => {
      const page = Number(url.searchParams.get('pIndex'));
      requestedPages.push(page);
      return {
        ok: true,
        json: async () => ({
          TVBPMBILL11: [
            { head: [{ list_total_count: 2 }, { RESULT: { CODE: 'INFO-000', MESSAGE: '정상' } }] },
            { row: [row({ BILL_ID: `PRC_TEST_${page}`, BILL_NO: `220000${page}` })] },
          ],
        }),
      };
    },
  });
  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(result.documents.length, 2);
  assert.equal(result.sourceResults[0].fetchedCount, 2);
});
