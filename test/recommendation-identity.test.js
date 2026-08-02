const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveRecommendationIdentity,
  normalizeDomesticTicker,
  verifyIdentityFromMarketProfile,
} = require('../src/utils/recommendation-identity');

test('normalizes domestic ticker suffixes only', () => {
  assert.equal(normalizeDomesticTicker('005930.KS'), '005930');
  assert.equal(normalizeDomesticTicker('000660.kq'), '000660');
  assert.equal(normalizeDomesticTicker('NVDA'), '');
});

test('corrects an AI ticker from directly related DART evidence', () => {
  const resolved = resolveRecommendationIdentity({
    name: 'DL이앤씨',
    ticker: '000040',
    related_article_ids: ['dart:1'],
  }, [{
    id: 'dart:1',
    disclosure: { corpName: 'DL이앤씨', stockCode: '375500', corpCode: '01390344' },
  }]);

  assert.equal(resolved.name, 'DL이앤씨');
  assert.equal(resolved.ticker, '375500');
  assert.equal(resolved.identity_resolution.status, 'verified');
  assert.equal(resolved.identity_resolution.source, 'dart_disclosure');
  assert.deepEqual(resolved.identity_resolution.correctedFields, ['ticker']);
});

test('does not guess when related disclosure evidence conflicts', () => {
  const resolved = resolveRecommendationIdentity({
    name: '회사A',
    ticker: '222222',
    related_article_ids: ['dart:a', 'dart:b'],
  }, [
    { id: 'dart:a', disclosure: { corpName: '회사A', stockCode: '111111' } },
    { id: 'dart:b', disclosure: { corpName: '회사B', stockCode: '222222' } },
  ]);

  assert.equal(resolved.ticker, '222222');
  assert.equal(resolved.identity_resolution.status, 'conflict');
  assert.equal(resolved.identity_resolution.reason, 'name_ticker_evidence_conflict');
});

test('verifies fixed watchlist instruments without DART evidence', () => {
  const resolved = resolveRecommendationIdentity({ name: '삼성전자', ticker: '005930.KS' });

  assert.equal(resolved.ticker, '005930');
  assert.equal(resolved.identity_resolution.status, 'verified');
  assert.equal(resolved.identity_resolution.source, 'watchlist');
});

test('verifies an otherwise unknown ticker only when the official quote name matches', () => {
  const verified = verifyIdentityFromMarketProfile({
    name: '새로운회사',
    ticker: '123456',
    identity_resolution: { status: 'unverified' },
  }, { name: '새로운회사', source: 'naver-finance' });
  const conflict = verifyIdentityFromMarketProfile({
    name: '다른회사',
    ticker: '123456',
    identity_resolution: { status: 'unverified' },
  }, { name: '새로운회사', source: 'naver-finance' });

  assert.equal(verified.identity_resolution.status, 'verified');
  assert.equal(verified.identity_resolution.source, 'official_quote_name');
  assert.equal(conflict.identity_resolution.status, 'conflict');
  assert.equal(conflict.identity_resolution.reason, 'official_quote_name_mismatch');
});
