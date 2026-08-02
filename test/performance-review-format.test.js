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
    performanceLearning: {
      rules: {
        minRiskReward: 2.5,
        requireStop: true,
        requireEntryTimingApproval: true,
      },
      actions: ['최근 손익비 부족 실패가 있어 최소 손익비를 일시적으로 0.5 상향합니다.'],
    },
    improvementActions: [
      '실행하지 않은 추천의 성과가 실제 매수한 추천보다 높습니다. 다음 주에는 매수 후보를 임의로 건너뛰지 말고, 계좌 한도 때문에 못 산 경우 계획매매로 남깁니다.',
    ],
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
  assert.match(message, /프롬프트\+모델 설정별 성과/);
  assert.match(message, /stock-analysis-v2\.1 \/ anthropic:claude-sonnet-4-5: 평가 3건/);
  assert.match(message, /표본 부족: 평가 3\/5건/);
  assert.match(message, /가격 데이터 품질/);
  assert.match(message, /가격 조회: 30건 · 실패 2건 \(6.67%\) · 빈 응답 1건/);
  assert.match(message, /판단: 현재 가격 provider 구조 유지/);
  assert.match(message, /최신 종목·가격유형 중 오래된 값: 0\/7건/);
  assert.match(message, /로컬 리서치/);
  assert.match(message, /삼성전자\(005930\): 2026-05-01~2026-05-08 기간 수익률 4.2%, 기간 중 최대 하락폭 -2.1%, 5거래일/);
  assert.match(message, /다음 개선 액션/);
  assert.match(message, /다음 추천에 적용할 학습 룰/);
  assert.match(message, /최소 손익비: 2.5:1/);
  assert.match(message, /매수 후보를 임의로 건너뛰지 말고/);
  assert.match(message, /추천 수익률은 실제 계좌 수익률이 아닙니다/);
  assert.match(message, /알림 실패: 즉시 0건 · 다이제스트 0건 · catch-up 0건/);
  assert.match(message, /기간 중 다이제스트 버퍼 유입: 0건 · 실제 pending 4건/);
  assert.match(message, /조치 필요 실패: 0건 · 정리된 과거 실패 1건/);
});

test('formatPerformanceReview labels unavailable stores instead of reporting zero or stale data', () => {
  const message = formatPerformanceReview({
    period: 'weekly',
    startDate: '2026-07-03',
    endDate: '2026-07-10',
    recommendationSummary: {
      dataAvailable: false,
      dataError: '503 schema cache unavailable',
      total: 0,
      evaluated: 0,
    },
    tradeSummary: {
      dataAvailable: false,
      dataError: '503 schema cache unavailable',
      total: 0,
      linked: 0,
    },
    collectorOps: {
      dataAvailable: false,
      dataError: '503 schema cache unavailable',
      totalRuns: 0,
    },
  });

  assert.match(message, /추천 데이터 조회 실패/);
  assert.match(message, /0건으로 해석하면 안 됨/);
  assert.match(message, /수집 이력 저장소 조회 실패/);
  assert.match(message, /실제 거래 데이터 조회 실패/);
  assert.doesNotMatch(message, /마지막 성공: 없음/);
});

test('monthly performance review leads with portfolio results and uses continuous section numbers', () => {
  const message = formatPerformanceReview({
    period: 'monthly',
    startDate: '2026-07-02',
    endDate: '2026-08-01',
    portfolioSummary: {
      dataAvailable: true,
      currentTotalAssetValue: 95531798,
      unrealizedPnl: -24139513,
      unrealizedPnlPct: -23.4,
      rawChangeAmount: 1000000,
      rawChangePct: 1.06,
      startTotalAssetValue: 94531798,
      liveValuedPositions: 9,
      positionCount: 9,
      topPositions: [{ name: 'SK하이닉스', weightPct: 30.57, unrealizedPnlPct: -5.75 }],
    },
    recommendationSummary: { dataAvailable: true, total: 0, evaluated: 0 },
    recommendationFunnel: { reportDays: 2, analyzedCandidates: 2, bullishCandidates: 1, watchOnlyCandidates: 2, approvedCandidates: 0 },
    recommendationTracker: {
      dataAvailable: true,
      totalStored: 11,
      evaluatedRecommendations: 8,
      fullyEvaluatedRecommendations: 8,
      verifiedCohort: 1,
      verifiedCohort20d: 1,
      missingPriceRecommendations: 3,
      byHorizon: { 1: 8, 5: 8, 20: 8 },
      latestRecommendationDate: '2026-05-08',
      latestVerifiedDate: '2026-05-07',
      latestEvaluationAt: '2026-06-08T08:30:00.000Z',
      engineHasHistory: true,
    },
    researchCandidateSummary: {
      dataAvailable: true,
      total: 12,
      evaluated20d: 4,
      topRejectionReasons: [{ reason: 'market_regime', count: 7 }],
    },
    tradeSummary: { dataAvailable: true, total: 0, linked: 0 },
    performanceLab: {},
    collectorOps: {},
    priceSourceQuality: {},
    notes: ['확인 필요'],
  });

  assert.match(message, /현재 총자산: 95,531,798원/);
  assert.match(message, /AI 추천 파이프라인/);
  assert.match(message, /이번 달 승인 추천: 0건/);
  assert.match(message, /종목 후보 2건/);
  assert.match(message, /누적 추적: 저장 신호 11건 · 평가 시작 8건 · 20일 완료 8건/);
  assert.match(message, /검증 코호트: 리스크 승인·계약 충족 1건 · 20일 완료 1건/);
  assert.match(message, /평가 제외: 기준 가격 없음 3건/);
  assert.match(message, /평가기 상태: 동작 이력 있음 · 이번 달 신규 승인 입력 없음/);
  assert.match(message, /Shadow 연구 코호트: 후보 12건 · 20일 평가 4건 · 실제 매매 대상 아님/);
  assert.match(message, /성과 판단: 평가 표본 없음/);
  assert.match(message, /다음 달 개선/);
  assert.doesNotMatch(message, /모델별 성과/);
  assert.doesNotMatch(message, /<b>7\./);
});
