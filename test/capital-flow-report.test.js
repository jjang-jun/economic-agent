const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCapitalFlowSnapshot } = require('../src/utils/capital-flow-report');
const { formatCapitalFlowSection } = require('../src/notify/telegram');

test('capital flow snapshot keeps actual investor flow separate from ETF proxy', () => {
  const snapshot = buildCapitalFlowSnapshot({
    investorFlow: {
      source: 'naver-finance',
      market: 'KOSPI',
      unit: '억원',
      latest: { date: '2026-08-03', foreign: 3200, institution: -1200, individual: -1900 },
      sums5d: { foreign: 8100, institution: 2400, individual: -10400 },
    },
    capitalFlowRadar: {
      capturedAt: '2026-08-03T06:00:00.000Z',
      isActualFundFlow: false,
      coverage: { available: 18, expected: 19 },
      regime: { hint: 'risk_on' },
      items: [{ symbol: 'QQQ' }],
      leaders: [{ symbol: 'QQQ', name: '나스닥100', return5dPct: 4.2 }],
      laggards: [{ symbol: 'TLT', name: '미국 장기국채', return5dPct: -2.1 }],
    },
  });

  assert.equal(snapshot.investorFlow.latest.foreign, 3200);
  assert.equal(snapshot.etfProxy.isActualFundFlow, false);
  assert.equal(snapshot.etfProxy.regime.hint, 'risk_on');
});

test('capital flow formatter always shows actual daily and five-day totals', () => {
  const message = formatCapitalFlowSection({
    investorFlow: {
      source: 'naver-finance',
      market: 'KOSPI',
      unit: '억원',
      date: '2026-08-03',
      latest: { foreign: 3200, institution: -1200 },
      sums5d: { foreign: 8100, institution: 2400 },
    },
    etfProxy: {
      coverage: { available: 18, expected: 19 },
      regime: { hint: 'risk_on' },
      leaders: [{ symbol: 'QQQ', name: '나스닥100' }],
      laggards: [{ symbol: 'TLT', name: '미국 장기국채' }],
    },
  });

  assert.match(message, /KOSPI 투자자 순매수 \(2026-08-03, 억원 · Naver Finance\)/);
  assert.match(message, /당일: 외국인 3,200억 순매수 · 기관 1,200억 순매도 · 합계 2,000억 순매수/);
  assert.match(message, /5일: 외국인 8,100억 순매수 · 기관 2,400억 순매수 · 합계 10,500억 순매수/);
  assert.match(message, /글로벌 ETF 가격·거래량 프록시: 위험선호 우세/);
  assert.match(message, /실제 설정·환매 순유입액이 아니라/);
});

test('capital flow formatter reports unavailable investor data without treating it as zero', () => {
  const message = formatCapitalFlowSection({});
  assert.match(message, /KOSPI 투자자 순매수: 조회 불가/);
  assert.doesNotMatch(message, /0억/);
});
