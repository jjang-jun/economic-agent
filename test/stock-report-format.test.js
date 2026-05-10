const test = require('node:test');
const assert = require('node:assert/strict');
const { formatStockReport } = require('../src/notify/telegram');

test('formatStockReport explains regime, VIX, USD/KRW, and risk reward blockers', () => {
  const message = formatStockReport({
    market_summary: '테스트 요약',
    sectors: [],
    stocks: [{
      name: '테스트종목',
      ticker: '005930',
      signal: 'neutral',
      conviction: 'low',
      reason: '테스트',
      risk_profile: {
        riskReward: 1.14,
        suggestedAmount: 3000000,
        suggestedWeightPct: 5,
      },
      risk_review: {
        action: 'watch_only',
        blockers: ['risk_reward: 1.14:1 / min 2.5:1'],
      },
    }],
    action_items: [],
    risk_flags: [],
    decision: {
      market: {
        regime: 'NEUTRAL',
        score: 0,
        reasons: [
          'VIX 17.19로 변동성 안정',
          'USD/KRW 1.59% 상승으로 원화 약세 부담',
        ],
        tags: [],
        warnings: [],
      },
      portfolio: {
        maxNewBuyAmount: 1000000,
        summary: {
          totalAssetValue: 60000000,
          cashAmount: 15000000,
          cashPct: 25,
          positionCount: 1,
          maxNewBuyAmount: 1000000,
        },
        riskBudget: {},
        positions: [],
      },
      actions: [],
    },
  });

  assert.match(message, /중립 \(점수 0\)/);
  assert.match(message, /VIX는 미국 주식시장 공포\/변동성 지표/);
  assert.match(message, /달러\/원 환율이 올랐다는 뜻/);
  assert.match(message, /제안 매수 원안 3,000,000원 → 1,000,000원 \(1회 상한 적용\) \(총자산 1.7%, 현금 6.7%\)/);
  assert.match(message, /손익비 부족: 기대수익이 예상손실의 1.14배/);
  assert.match(message, /매수 보류/);
});
