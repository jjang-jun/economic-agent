const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyPolicyDocument,
  classifyStage,
  extractDates,
} = require('../src/utils/policy-classifier');

function document(overrides = {}) {
  return {
    externalId: 'official-1',
    title: '생산적금융 ISA 세제개편안 발표',
    summary: '연간 납입한도와 비과세 혜택을 개편한다.',
    link: 'https://mofe.go.kr/example',
    pubDate: '2026-08-03T09:00:00+09:00',
    sourceId: 'mofe-press',
    authority: '재정경제부',
    sourceKind: 'official_press',
    ...overrides,
  };
}

test('classifyPolicyDocument separates domains and marks a government proposal as unconfirmed', () => {
  const event = classifyPolicyDocument(document());
  assert.equal(event.domain, 'tax');
  assert.ok(event.domains.includes('capital_market'));
  assert.equal(event.stage, 'government_proposal');
  assert.match(event.action, /확정 전/);
  assert.match(event.id, /^policy:/);
});

test('official clarification overrides proposal language', () => {
  const event = classifyPolicyDocument(document({
    sourceKind: 'official_clarification',
    title: '생산적금융 ISA 구체적 내용은 결정된 바 없습니다',
  }));
  assert.equal(event.stage, 'official_clarification');
  assert.match(event.action, /보류/);
});

test('stage classifier does not treat a future effective date as already effective', () => {
  assert.equal(classifyStage({}, '2027년 1월 1일 시행 예정인 주택 세제 개정안'), 'government_proposal');
  assert.equal(classifyStage({}, '개정 법률이 2026년 8월 4일부터 시행합니다'), 'effective');
});

test('extractDates returns normalized dates without duplicates', () => {
  assert.deepEqual(extractDates('2026년 9월 3일 제출, 2026.9.3. 재확인'), ['2026-09-03']);
});

test('unrelated ministry administration is excluded', () => {
  assert.equal(classifyPolicyDocument(document({
    title: '재정경제부 직원 인사발령',
    summary: '과장급 인사를 발표했다.',
  })), null);
});
