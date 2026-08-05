const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyExpertRequest,
  explicitCcRoles,
  explicitToRole,
} = require('../src/config/expert-roles');

test('expert router assigns real-estate decisions to one primary and bounded reviewers', () => {
  const oneReviewer = classifyExpertRequest('부동산 전문가에게 아파트 매수 예산을 검토해줘', {
    maxReviewers: 1,
  });
  assert.equal(oneReviewer.primary.id, 'real_estate');
  assert.deepEqual(oneReviewer.reviewers.map(role => role.id), ['portfolio_manager']);

  const twoReviewers = classifyExpertRequest('아파트를 매입해도 될까?', { maxReviewers: 2 });
  assert.equal(twoReviewers.primary.id, 'real_estate');
  assert.deepEqual(twoReviewers.reviewers.map(role => role.id), ['portfolio_manager', 'tax_pension']);
});

test('expert router supports explicit to and cc without turning every role into a reviewer', () => {
  const text = 'to: 투자 전문가 cc: 리스크 관리자 삼성전자 추가 매수를 검토해줘';
  assert.equal(explicitToRole(text).id, 'investment');
  assert.deepEqual(explicitCcRoles(text).map(role => role.id), ['risk_manager']);

  const assignment = classifyExpertRequest(text, { maxReviewers: 2 });
  assert.equal(assignment.primary.id, 'investment');
  assert.deepEqual(assignment.reviewers.map(role => role.id), ['risk_manager']);
  assert.equal(assignment.source, 'explicit_to');
});

test('informational tax questions avoid reviewers while unrelated greetings do not call experts', () => {
  const tax = classifyExpertRequest('ISA 세제개편 내용을 설명해줘', { maxReviewers: 2 });
  assert.equal(tax.primary.id, 'tax_pension');
  assert.deepEqual(tax.reviewers, []);
  assert.equal(classifyExpertRequest('안녕, 오늘 어때?'), null);
});
