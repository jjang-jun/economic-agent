const test = require('node:test');
const assert = require('node:assert/strict');
const { formatActionReport } = require('../src/notify/telegram');
const { buildActionReport } = require('../src/utils/action-report');

test('formatActionReport renders Korean buy candidates as whole shares with entry and stop', () => {
  const message = formatActionReport({
    date: '2026-05-08',
    portfolio: {
      totalAssetValue: 60000000,
      cashAmount: 15000000,
      cashRatio: 0.25,
      positionCount: 1,
      maxNewBuyAmount: 1000000,
      maxPositionRatio: 0.15,
    },
    newBuyCandidates: [{
      name: 'SK하이닉스',
      ticker: '000660',
      riskProfile: {
        suggestedAmount: 2966738,
        entryReferencePrice: 171000,
        stopLossPrice: 159030,
        riskReward: 2,
      },
      riskReview: { action: 'candidate' },
    }],
    watchOnlyCandidates: [],
    holdCandidates: [],
    reduceCandidates: [],
    sellCandidates: [],
  });

  assert.match(message, /기준매수가 171,000원/);
  assert.match(message, /손절가 159,030원/);
  assert.match(message, /제안 5주 \/ 855,000원 \(1회 상한\)/);
  assert.doesNotMatch(message, /2,966,738원/);
});

test('formatActionReport explains hold evidence and reduce amount', () => {
  const message = formatActionReport({
    date: '2026-05-08',
    portfolio: {
      totalAssetValue: 60000000,
      cashAmount: 15000000,
      cashRatio: 0.25,
      positionCount: 2,
      maxPositionRatio: 0.15,
    },
    newBuyCandidates: [],
    watchOnlyCandidates: [],
    holdCandidates: [{
      name: 'VGT',
      ticker: 'VGT',
      quantity: 9.74,
      currentPrice: 515,
      avgPrice: 433.14,
      unrealizedPnl: 1200000,
      unrealizedPnlPct: 18.9,
      weight: 0.08,
      actionReasons: ['손절/비중/추세 경고 없음'],
      actionEvidence: ['현재 손익 18.9%', '비중 8%', '손절 기준 -8% 미도달'],
      actionStopLossPct: 8,
      actionStopPrice: 473.8,
      actionStopPlan: { trailingApplied: true },
    }],
    reduceCandidates: [{
      name: '넷플릭스',
      ticker: 'NFLX',
      quantity: 22,
      currentPrice: 1100,
      marketValue: 24200,
      unrealizedPnl: -900,
      unrealizedPnlPct: -3.9,
      weight: 0.2,
      actionReasons: ['종목 비중 20%로 한도 초과'],
      actionEvidence: ['비중 20% > 한도 15%'],
      actionStopLossPct: 8,
    }],
    sellCandidates: [],
  });

  assert.match(message, /VGT/);
  assert.match(message, /수익보호 손절가 \$473.8/);
  assert.match(message, /근거 현재 손익 18.9%, 비중 8%, 손절 기준 -8% 미도달/);
  assert.match(message, /넷플릭스/);
  assert.match(message, /축소안/);
  assert.match(message, /매도/);
});

test('formatActionReport blocks Korean candidates when one share exceeds suggested cap', () => {
  const message = formatActionReport({
    date: '2026-05-08',
    portfolio: {
      totalAssetValue: 60000000,
      cashAmount: 15000000,
      cashRatio: 0.25,
      positionCount: 1,
      maxNewBuyAmount: 1000000,
    },
    newBuyCandidates: [{
      name: 'SK하이닉스',
      ticker: '000660.KS',
      entry: { price: 1654000 },
      riskProfile: {
        suggestedAmount: 2966738,
        expectedLossPct: 5,
        riskReward: 2,
      },
      riskReview: { action: 'candidate' },
    }],
    watchOnlyCandidates: [],
    holdCandidates: [],
    reduceCandidates: [],
    sellCandidates: [],
  });

  assert.match(message, /기준매수가 1,654,000원/);
  assert.match(message, /손절가 1,571,300원/);
  assert.match(message, /매수 보류: 1주 매수에 필요한 금액 1,654,000원보다 제안금액이 작습니다/);
});

test('buildActionReport enforces sector limits on buys and holdings', () => {
  const report = buildActionReport({
    portfolio: {
      totalAssetValue: 20000000,
      cashAmount: 5000000,
      cashRatio: 0.25,
      maxSectorRatio: 0.35,
      maxPositionRatio: 0.2,
      positions: [
        { name: 'DRAM', ticker: 'DRAM', sector: 'semiconductor', weight: 0.24, unrealizedPnlPct: 6.8 },
        { name: 'SK하이닉스', ticker: '000660', sector: 'semiconductor', weight: 0.16, unrealizedPnlPct: 3.1 },
      ],
    },
    recommendations: [{
      name: '삼성전자',
      ticker: '005930',
      signal: 'bullish',
      conviction: 'high',
      sector: 'semiconductor',
      createdAt: new Date().toISOString(),
      riskProfile: {
        tradeable: true,
        suggestedAmount: 1000000,
        riskReward: 2.5,
      },
      riskReview: { action: 'candidate', approved: true, blockers: [] },
    }],
  });

  assert.equal(report.newBuyCandidates.length, 0);
  assert.equal(report.watchOnlyCandidates.length, 1);
  assert.match(report.watchOnlyCandidates[0].riskReview.blockers[0], /semiconductor 섹터 40% > 한도 35%/);
  assert.equal(report.reduceCandidates.length, 2);
  assert.match(report.reduceCandidates[0].actionReasons.join(' '), /semiconductor 섹터 비중 40%로 한도 초과/);
});

test('buildActionReport moves Korean candidates to watch when one share exceeds cap', () => {
  const report = buildActionReport({
    portfolio: {
      totalAssetValue: 20000000,
      cashAmount: 15000000,
      cashRatio: 0.75,
      maxNewBuyAmount: 1000000,
      positions: [],
    },
    recommendations: [{
      name: 'SK하이닉스',
      ticker: '000660.KS',
      signal: 'bullish',
      conviction: 'high',
      createdAt: new Date().toISOString(),
      riskProfile: {
        tradeable: true,
        suggestedAmount: 1000000,
        entryReferencePrice: 1654000,
        riskReward: 2.5,
      },
      riskReview: { action: 'candidate', approved: true, blockers: [] },
    }],
  });

  assert.equal(report.newBuyCandidates.length, 0);
  assert.equal(report.watchOnlyCandidates.length, 1);
  assert.match(report.watchOnlyCandidates[0].riskReview.blockers[0], /1주 가격 1,654,000원 > 제안금액 1,000,000원/);
});

test('classifyPosition applies trailing stop and rebalance trim plans', () => {
  const report = buildActionReport({
    portfolio: {
      totalAssetValue: 10000000,
      cashAmount: 1000000,
      maxPositionRatio: 0.2,
      maxSectorRatio: 0.4,
      stopLossPct: -7,
      trimProfitPct: 20,
      positions: [{
        name: 'Winner',
        ticker: 'WIN',
        sector: 'tech',
        quantity: 10,
        avgPrice: 100,
        currentPrice: 130,
        marketValue: 3000000,
        weight: 0.3,
        unrealizedPnlPct: 30,
      }],
    },
    recommendations: [],
  });

  assert.equal(report.reduceCandidates.length, 1);
  assert.equal(report.reduceCandidates[0].actionStopPrice, 120.9);
  assert.equal(report.reduceCandidates[0].actionStopPlan.trailingApplied, true);
  assert.equal(report.reduceCandidates[0].actionTrimPlan.amount, 1000000);
});
