const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPerformanceReview } = require('../src/notify/telegram');

test('formatPerformanceReview explains recommendation and execution metrics in plain Korean', () => {
  const message = formatPerformanceReview({
    period: 'weekly',
    startDate: '2026-05-01',
    endDate: '2026-05-08',
    recommendationSummary: {
      total: 10,
      evaluated: 6,
      winRatePct: 50,
      avgSignalReturnPct: 2.4,
      avgAlphaPct: 1.1,
    },
    tradeSummary: {
      total: 3,
      linked: 2,
      linkedRatePct: 66.7,
    },
    performanceLab: {
      executedRecommendationQuality: { avgSignalReturnPct: 1.5 },
      missedRecommendationQuality: { avgSignalReturnPct: 3.2 },
      failureAnalysis: [
        { reason: 'low_risk_reward', count: 2, avgSignalReturnPct: -3.4, examples: ['A', 'B'] },
      ],
      leaders: {
        sectors: [
          { key: 'semiconductor', evaluated: 3, winRatePct: 66.7, avgSignalReturnPct: 2.1 },
        ],
        riskFactors: [
          { key: 'rr_ok', evaluated: 4, winRatePct: 75, avgSignalReturnPct: 3.2 },
        ],
        aiVersions: [
          { key: 'stock-analysis-v2.1 / anthropic:claude-sonnet-4-5', evaluated: 3, winRatePct: 66.7, avgSignalReturnPct: 2.8, sampleNote: '표본 부족: 평가 3/5건' },
        ],
        aiModels: [
          { key: 'anthropic:claude-sonnet-4-5', evaluated: 3, winRatePct: 66.7, avgSignalReturnPct: 2.8, sampleNote: '표본 부족: 평가 3/5건' },
        ],
        promptVersions: [
          { key: 'stock-analysis-v2.1', evaluated: 3, winRatePct: 66.7, avgSignalReturnPct: 2.8, sampleNote: '표본 부족: 평가 3/5건' },
        ],
      },
    },
    behaviorReview: {
      tradeReview: {
        buyTrades: 2,
        unlinkedBuys: 1,
        watchOnlyBuys: 0,
      },
    },
    collectorOps: {
      totalRuns: 100,
      completedRuns: 100,
      successfulRuns: 99,
      failedRuns: 1,
      actionableFailedRuns: 0,
      resolvedFailureRuns: 1,
      totalImmediateAlerts: 0,
      alertEvents: {
        sentDigest: 3,
        actionableFailedImmediate: 0,
        historicalFailedImmediate: 1,
        failedDigest: 0,
        pendingDigest: 4,
        sentCatchUp: 1,
        failedCatchUp: 0,
        pendingCatchUp: 0,
      },
    },
    priceSourceQuality: {
      totalSnapshots: 20,
      tickerCount: 7,
      eodSnapshots: 8,
      officialEod: {
        krx: 3,
        dataGoKr: 4,
        ratePct: 87.5,
      },
      kisEodFallback: 1,
      fallback: {
        total: 2,
        ratePct: 10,
      },
      attempts: {
        total: 30,
        failed: 2,
        failureRatePct: 6.67,
        empty: 1,
      },
      providerDecision: {
        label: '현재 가격 provider 구조 유지',
      },
      staleSnapshots: 0,
    },
    backtestResearch: {
      enabled: true,
      provider: 'auto',
      tickerCount: 1,
      results: [
        {
          ticker: '005930',
          name: '삼성전자',
          from: '2026-05-01',
          to: '2026-05-08',
          returnPct: 4.2,
          maxDrawdownPct: -2.1,
          rowCount: 5,
        },
      ],
      failures: [],
    },
    notes: ['실제 거래 중 추천과 연결되지 않은 비중이 높습니다.'],
  });

  assert.match(message, /한줄 판단/);
  assert.match(message, /AI 추천 성과/);
  assert.match(message, /승률: 50% - 평가 완료 추천 중 방향이 맞은 비율/);
  assert.match(message, /평균 추천 수익률: 2.4% - 추천 방향 기준 평균 성과/);
  assert.match(message, /시장 대비 초과수익: 1.1% - KOSPI\/Nasdaq 등 기준지수보다 더 잘했는지/);
  assert.match(message, /내 실행 품질/);
  assert.match(message, /추천을 실제로 산 경우 평균: 1.5%/);
  assert.match(message, /추천했지만 매수하지 않은 경우 평균: 3.2%/);
  assert.match(message, /실패 원인/);
  assert.match(message, /손익비가 낮았던 추천: 2건/);
  assert.match(message, /섹터별 성과/);
  assert.match(message, /semiconductor: 평가 3건/);
  assert.match(message, /리스크 요인별 성과/);
  assert.match(message, /손익비 기준 통과: 평가 4건/);
  assert.match(message, /모델별 성과/);
  assert.match(message, /anthropic:claude-sonnet-4-5: 평가 3건/);
  assert.match(message, /프롬프트 버전별 성과/);
  assert.match(message, /stock-analysis-v2\.1: 평가 3건/);
  assert.match(message, /프롬프트\+모델 조합별 성과/);
  assert.match(message, /stock-analysis-v2\.1 \/ anthropic:claude-sonnet-4-5: 평가 3건/);
  assert.match(message, /표본 부족: 평가 3\/5건/);
  assert.match(message, /가격 데이터 품질/);
  assert.match(message, /가격 조회: 30건 · 실패 2건 \(6.67%\) · 빈 응답 1건/);
  assert.match(message, /판단: 현재 가격 provider 구조 유지/);
  assert.match(message, /KRX 3건 · 공공데이터 4건 · KIS 대체 사용 1건/);
  assert.match(message, /로컬 리서치/);
  assert.match(message, /삼성전자\(005930\): 2026-05-01~2026-05-08 기간 수익률 4.2%, 기간 중 최대 하락폭 -2.1%, 5거래일/);
  assert.match(message, /추천 수익률은 실제 계좌 수익률이 아닙니다/);
  assert.match(message, /다이제스트 처리: 전송완료 3건 · 대기 4건 · 실패 0건/);
  assert.match(message, /조치 필요 실패: 0건 · 정리된 과거 실패 1건/);
  assert.match(message, /즉시 알림 실패: 최근 0건 · 과거 실패 1건/);
  assert.match(message, /catch-up 처리: 전송완료 1건 · 대기 0건 · 실패 0건/);
});
