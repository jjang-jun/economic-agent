const test = require('node:test');
const assert = require('node:assert/strict');
const { formatActionReport } = require('../src/notify/telegram');
const { buildActionReport, enrichRecommendationsWithLatestPrices } = require('../src/utils/action-report');

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
      latestQuote: {
        price: 168000,
        currency: 'KRW',
        source: 'kis-rest',
      },
      riskReview: { action: 'candidate' },
    }],
    watchOnlyCandidates: [],
    holdCandidates: [],
    reduceCandidates: [],
    sellCandidates: [],
  });

  assert.match(message, /읽는 법/);
  assert.match(message, /한눈에 보기/);
  assert.match(message, /<pre>구분       건수/);
  assert.match(message, /매수후보\s+1/);
  assert.match(message, /추천 171,000원/);
  assert.match(message, /현재 168,000원 \(-1.7%\)/);
  assert.match(message, /손절 159,030원/);
  assert.match(message, /제안: 5주 \/ 855,000원 \(원안 2,966,738원, 1회 상한\)/);
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
  assert.match(message, /근거: 현재 손익 18.9%, 비중 8%, 손절 기준 -8% 미도달/);
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
      latestQuote: { price: 1686000, currency: 'KRW' },
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

  assert.match(message, /추천 1,654,000원/);
  assert.match(message, /현재 1,686,000원 \(\+1.9%\)/);
  assert.match(message, /손절 1,571,300원/);
  assert.match(message, /제안: 매수 보류 - 1주 매수에 필요한 금액 1,654,000원보다 제안금액이 작습니다/);
  assert.match(message, /원안 2,966,738원, 1회 상한 1,000,000원 적용/);
});

test('formatActionReport defaults non-Korean prices to USD when currency is omitted', () => {
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
      name: 'VGT',
      ticker: 'VGT',
      riskProfile: {
        suggestedAmount: 500000,
        entryReferencePrice: 515.25,
        stopLossPrice: 474.03,
        riskReward: 2.2,
      },
      riskReview: { action: 'candidate' },
    }],
    watchOnlyCandidates: [],
    holdCandidates: [],
    reduceCandidates: [],
    sellCandidates: [],
  });

  assert.match(message, /추천 \$515.25/);
  assert.match(message, /손절 \$474.03/);
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

test('enrichRecommendationsWithLatestPrices attaches current quote to recent non-held candidates only', async () => {
  const recommendations = await enrichRecommendationsWithLatestPrices([
    {
      name: '삼성전자',
      ticker: '005930.KS',
      signal: 'bullish',
      createdAt: new Date().toISOString(),
      riskProfile: { entryReferencePrice: 270000 },
    },
    {
      name: '보유종목',
      ticker: '000660.KS',
      signal: 'bullish',
      createdAt: new Date().toISOString(),
      riskProfile: { entryReferencePrice: 1600000 },
    },
  ], {
    positions: [{ ticker: '000660.KS' }],
  }, {
    fetcher: async symbol => ({
      symbol,
      price: 268500,
      currency: 'KRW',
      source: 'test-price',
      marketTime: '2026-05-08T06:30:00.000Z',
    }),
  });

  assert.equal(recommendations[0].latestQuote.price, 268500);
  assert.equal(recommendations[0].latestPriceChangePct, -0.56);
  assert.equal(recommendations[1].latestQuote, undefined);
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

test('classifyPosition converts USD prices before calculating trim shares', () => {
  const report = buildActionReport({
    portfolio: {
      totalAssetValue: 60000000,
      cashAmount: 1000000,
      maxPositionRatio: 0.2,
      maxSectorRatio: 0.8,
      stopLossPct: -7,
      positions: [{
        name: 'DRAM',
        ticker: 'DRAM',
        sector: 'semiconductor',
        quantity: 200,
        currentPrice: 50,
        fxRate: 1400,
        marketValue: 14000000,
        weight: 0.23,
        unrealizedPnlPct: 17.3,
      }],
    },
    recommendations: [],
  });

  assert.equal(report.reduceCandidates.length, 1);
  assert.equal(report.reduceCandidates[0].actionTrimPlan.amount, 2000000);
  assert.equal(Math.round(report.reduceCandidates[0].actionTrimPlan.quantity), 29);
});
