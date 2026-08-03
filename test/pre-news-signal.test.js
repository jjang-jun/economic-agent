const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPreNewsUniverse,
  buildPreNewsSignalReport,
  filterAlreadyAlertedPreNews,
  markPreNewsSignalsSent,
  scorePreNewsSignal,
  articleMatchesSignal,
  classifySignalEvidence,
  evaluateSignalFollowUp,
  attachSignalMarketFlow,
  updateSignalMarketFlow,
  flowObservationKey,
} = require('../src/utils/pre-news-signal');
const { formatPreNewsSignalReport } = require('../src/notify/telegram');

const now = new Date('2026-05-11T01:05:00.000Z');

test('buildPreNewsUniverse uses holdings, recent recommendations, and focused watchlists', () => {
  const universe = buildPreNewsUniverse({
    now,
    portfolio: {
      positions: [{ name: 'DRAM ETF', ticker: '396500' }],
    },
    recommendations: [
      {
        id: 'rec-1',
        name: '삼성전자',
        ticker: '005930',
        signal: 'bullish',
        createdAt: '2026-05-11T00:00:00.000Z',
        thesis: 'HBM 수요',
      },
      {
        id: 'old',
        name: '오래된 추천',
        ticker: '000660',
        signal: 'bullish',
        createdAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'us',
        name: 'NVIDIA',
        ticker: 'NVDA',
        signal: 'bullish',
        createdAt: '2026-05-11T00:00:00.000Z',
      },
    ],
    watchlist: {
      preopen: [{ symbol: '005930.KS', name: '삼성전자' }, { symbol: 'SPY', name: 'S&P 500 ETF' }],
      close: [{ symbol: '000660.KS', name: 'SK하이닉스' }],
      globalMomentum: [{ symbol: 'MU', name: 'Micron Technology' }],
    },
  });

  assert.deepEqual(universe.map(item => item.symbol).sort(), ['000660.KS', '005930.KS', '396500.KS', 'MU', 'NVDA']);
  assert.ok(universe.find(item => item.symbol === '005930.KS').sources.includes('recent_recommendation'));
  assert.ok(universe.find(item => item.symbol === '396500.KS').sources.includes('holding'));
  assert.ok(universe.find(item => item.symbol === 'NVDA').sources.includes('recent_recommendation'));
  assert.ok(universe.find(item => item.symbol === 'MU').sources.includes('watchlist'));
});

test('scorePreNewsSignal keeps technical-only watchlist strength as watch', () => {
  const signal = scorePreNewsSignal({
    symbol: '005930.KS',
    ticker: '005930',
    name: '삼성전자',
    sources: ['watchlist'],
  }, {
    name: '삼성전자',
    price: 81000,
    breakout20d: true,
    near20dHigh: true,
    volumeRatio20d: 1.6,
    relativeStrength20d: 6,
    priceAboveMa5: true,
    priceAboveMa20: true,
    ma5AboveMa20: true,
    ma20Slope5dPct: 0.7,
    distanceFromMa20Pct: 4,
  });

  assert.equal(signal.action, 'watch');
  assert.equal(signal.name, '삼성전자');
  assert.equal(signal.originalName, '삼성전자');
  assert.ok(signal.score >= 5);
  assert.ok(signal.reasons.some(item => item.includes('20일 고점 돌파')));
});

test('article evidence matches a stock deterministically and only uses pre-detection timestamps', () => {
  const signal = { ticker: '005930', name: '삼성전자' };
  const prior = {
    id: 'prior',
    title: '삼성전자 HBM 공급 확대',
    source: 'DART',
    pubDate: '2026-05-11T00:30:00.000Z',
    pubDatePrecision: 'datetime',
  };
  const future = {
    id: 'future',
    title: '삼성전자 주가 급등',
    pubDate: '2026-05-11T01:30:00.000Z',
    pubDatePrecision: 'datetime',
  };

  assert.equal(articleMatchesSignal(prior, signal), true);
  const evidence = classifySignalEvidence(signal, [prior, future], {
    detectedAt: '2026-05-11T01:00:00.000Z',
    lookbackHours: 12,
    dataAvailable: true,
  });
  assert.equal(evidence.status, 'related_information_found');
  assert.deepEqual(evidence.relatedArticles.map(item => item.id), ['prior']);
  assert.equal(evidence.relatedArticles[0].leadMinutes, 30);
});

test('article evidence distinguishes unknown publication time and unavailable storage', () => {
  const signal = { ticker: '005930', name: '삼성전자' };
  const dateOnly = classifySignalEvidence(signal, [{
    id: 'dart-date',
    title: '삼성전자 공시',
    pubDate: '2026-05-11',
    pubDatePrecision: 'date',
  }], {
    detectedAt: '2026-05-11T01:00:00.000Z',
    dataAvailable: true,
  });
  assert.equal(dateOnly.status, 'same_day_time_unverified');

  const unavailable = classifySignalEvidence(signal, [], {
    detectedAt: '2026-05-11T01:00:00.000Z',
    dataAvailable: false,
  });
  assert.equal(unavailable.status, 'evidence_unavailable');
});

test('article evidence does not match a global stock on a generic company-name token', () => {
  const signal = { ticker: 'MU', name: 'Micron Technology Inc' };
  assert.equal(articleMatchesSignal({
    title: '한국 첨단 technology 산업 지원 확대',
  }, signal), false);
  assert.equal(articleMatchesSignal({
    title: 'Micron, 차세대 HBM 공급 계획 공개',
  }, signal), true);
});

test('signal follow-up records the first related article published after detection', () => {
  const updated = evaluateSignalFollowUp({
    id: 'signal-1',
    ticker: '005930',
    name: '삼성전자',
    detectedAt: '2026-05-11T01:00:00.000Z',
    evidence: { status: 'unexplained_at_detection', relatedArticles: [] },
  }, [{
    id: 'after',
    title: '삼성전자 신규 공급 계약',
    pubDate: '2026-05-11T02:15:00.000Z',
    pubDatePrecision: 'datetime',
    source: 'DART',
  }], {
    checkedAt: '2026-05-11T03:00:00.000Z',
    dataAvailable: true,
  });

  assert.equal(updated.evidence.status, 'related_information_after_signal');
  assert.equal(updated.evidence.firstFollowingArticle.id, 'after');
  assert.equal(updated.evidence.firstFollowingArticle.lagMinutes, 75);
});

test('signal follow-up rechecks evidence after article storage recovers', () => {
  const updated = evaluateSignalFollowUp({
    id: 'signal-retry',
    ticker: '005930',
    name: '삼성전자',
    detectedAt: '2026-05-11T01:00:00.000Z',
    evidence: {
      status: 'evidence_unavailable',
      lookbackHours: 12,
      relatedArticles: [],
    },
  }, [{
    id: 'before-recovered',
    title: '삼성전자 공급 계약 공시',
    pubDate: '2026-05-11T00:20:00.000Z',
    pubDatePrecision: 'datetime',
    source: 'DART',
  }], {
    checkedAt: '2026-05-11T02:00:00.000Z',
    dataAvailable: true,
  });

  assert.equal(updated.evidence.status, 'related_information_found');
  assert.equal(updated.evidence.relatedArticles[0].id, 'before-recovered');
  assert.equal(updated.evidence.relatedArticles[0].leadMinutes, 40);
});

test('market flow context records detection alignment and same-date follow-up deltas', () => {
  const detected = attachSignalMarketFlow({
    ticker: '005930',
    direction: 'up',
    date: '2026-05-11',
  }, {
    investorFlow: {
      source: 'naver-finance',
      market: 'KOSPI',
      unit: '억원',
      date: '2026-05-11',
      latest: { foreign: 1000, institution: -200 },
      sums5d: { foreign: 4000, institution: 500 },
    },
  }, '2026-05-11T01:00:00.000Z');

  assert.equal(detected.marketFlowContext.alignmentAtDetection, 'market_aligned');
  assert.equal(detected.marketFlowContext.atDetection.latest.combined, 800);

  const updated = updateSignalMarketFlow(detected, {
    investorFlow: {
      source: 'naver-finance',
      market: 'KOSPI',
      unit: '억원',
      date: '2026-05-11',
      latest: { foreign: 1600, institution: -100 },
      sums5d: { foreign: 4600, institution: 600 },
    },
  }, '2026-05-11T03:00:00.000Z');

  assert.equal(updated.marketFlowContext.status, 'same_market_date_follow_up');
  assert.equal(updated.marketFlowContext.alignmentAtLastObserved, 'market_aligned');
  assert.deepEqual(updated.marketFlowContext.sameMarketDateDelta, {
    foreign: 600,
    institution: 100,
    combined: 700,
  });
});

test('market flow context does not present KOSPI flow as stock-specific or global-stock alignment', () => {
  const detected = attachSignalMarketFlow({ ticker: 'GOOGL', direction: 'up' }, {
    investorFlow: {
      source: 'naver-finance',
      market: 'KOSPI',
      unit: '억원',
      date: '2026-05-11',
      latest: { foreign: 1000, institution: 200 },
      sums5d: { foreign: 4000, institution: 500 },
    },
  });

  assert.equal(detected.marketFlowContext.scope, 'kospi_market_context_not_stock_specific');
  assert.equal(detected.marketFlowContext.alignmentAtDetection, 'market_context_only');
});

test('market flow alignment does not treat a prior trading date as same-session confirmation', () => {
  const detected = attachSignalMarketFlow({
    ticker: '005930',
    direction: 'up',
    date: '2026-05-11',
  }, {
    investorFlow: {
      source: 'naver-finance',
      market: 'KOSPI',
      unit: '억원',
      date: '2026-05-08',
      latest: { foreign: 1000, institution: 200 },
      sums5d: { foreign: 4000, institution: 500 },
    },
  });

  assert.equal(detected.marketFlowContext.alignmentAtDetection, 'prior_market_date_context');
});

test('unchanged first-available flow does not become a false follow-up change', () => {
  const signal = {
    ticker: '005930',
    direction: 'up',
    date: '2026-05-11',
    marketFlowContext: {
      scope: 'kospi_market_context_not_stock_specific',
      status: 'same_market_date_follow_up_after_detection',
      atDetection: null,
      firstAvailableAfterDetection: {
        observedAt: '2026-05-11T01:00:00.000Z',
        date: '2026-05-09',
        latest: { foreign: 1000, institution: 200, combined: 1200 },
        sums5d: { foreign: 4000, institution: 500, combined: 4500 },
      },
      lastObserved: {
        observedAt: '2026-05-11T01:00:00.000Z',
        date: '2026-05-09',
        latest: { foreign: 1000, institution: 200, combined: 1200 },
        sums5d: { foreign: 4000, institution: 500, combined: 4500 },
      },
      alignmentAtDetection: 'neutral_or_unavailable',
    },
  };
  const updated = updateSignalMarketFlow(signal, {
    investorFlow: {
      source: 'naver-finance',
      market: 'KOSPI',
      unit: '억원',
      date: '2026-05-09',
      latest: { foreign: 1000, institution: 200 },
      sums5d: { foreign: 4000, institution: 500 },
    },
  });

  assert.equal(updated.marketFlowContext.status, 'first_available_after_detection');
  assert.equal(updated.marketFlowContext.alignmentAtLastObserved, 'prior_market_date_context');
});

test('flow observation identity is stable across database JSON property order', () => {
  const left = {
    date: '2026-05-11',
    latest: { foreign: 1000, institution: 200, combined: 1200 },
    sums5d: { foreign: 4000, institution: 500, combined: 4500 },
  };
  const right = {
    date: '2026-05-11',
    latest: { combined: 1200, institution: 200, foreign: 1000 },
    sums5d: { institution: 500, combined: 4500, foreign: 4000 },
  };
  assert.equal(flowObservationKey(left), flowObservationKey(right));
});

test('scorePreNewsSignal promotes a strong personally relevant compound signal', () => {
  const signal = scorePreNewsSignal({
    symbol: '005930.KS',
    ticker: '005930',
    name: '삼성전자',
    sources: ['holding'],
  }, {
    name: '삼성전자',
    price: 81000,
    changePercent: 6,
    breakout20d: true,
    volumeRatio20d: 1.6,
    relativeStrength20d: 6,
    priceAboveMa5: true,
    priceAboveMa20: true,
    ma5AboveMa20: true,
    ma20Slope5dPct: 0.7,
    distanceFromMa20Pct: 4,
  });

  assert.equal(signal.action, 'pre_news_candidate');
  assert.ok(signal.score >= 7);
});

test('scorePreNewsSignal promotes an extreme holding selloff', () => {
  const signal = scorePreNewsSignal({
    symbol: '005930.KS',
    ticker: '005930',
    name: '삼성전자',
    sources: ['holding'],
  }, {
    name: '삼성전자',
    price: 70000,
    changePercent: -11,
  });

  assert.equal(signal.action, 'pre_news_candidate');
  assert.ok(signal.reasons.some(item => item.includes('급락')));
});

test('scorePreNewsSignal promotes sharp same-day global moves even when technical history is sparse', () => {
  const signal = scorePreNewsSignal({
    symbol: 'MU',
    ticker: 'MU',
    name: 'Micron Technology',
    sources: ['watchlist'],
  }, {
    name: 'Micron Technology',
    price: 744.51,
    changePercent: 15.16,
  });

  assert.equal(signal.action, 'pre_news_candidate');
  assert.equal(signal.score, 5);
  assert.ok(signal.reasons.some(item => item.includes('당일 급등')));
});

test('scorePreNewsSignal still alerts an extreme move while warning against chasing', () => {
  const signal = scorePreNewsSignal({
    symbol: 'MU',
    ticker: 'MU',
    name: 'Micron Technology',
    sources: ['watchlist'],
  }, {
    name: 'Micron Technology',
    price: 900,
    changePercent: 12,
    distanceFromMa20Pct: 15,
  });

  assert.equal(signal.action, 'pre_news_candidate');
  assert.ok(signal.warnings.some(item => item.includes('추격 금지')));
});

test('buildPreNewsSignalReport filters duplicates after alert state', async () => {
  const report = await buildPreNewsSignalReport({
    now,
    portfolio: { positions: [] },
    watchlist: { preopen: [], close: [] },
    recommendations: [{
      id: 'rec-1',
      name: '삼성전자',
      ticker: '005930',
      signal: 'bullish',
      createdAt: '2026-05-11T00:00:00.000Z',
    }],
    fetcher: async () => ({
      symbol: '005930.KS',
      name: '삼성전자',
      price: 81000,
      breakout20d: true,
      near20dHigh: true,
      volumeRatio20d: 1.6,
      return20dPct: 10,
      movingAverage5d: 80000,
      movingAverage20d: 78000,
      distanceFromMa20Pct: 3.85,
      priceAboveMa5: true,
      priceAboveMa20: true,
      ma5AboveMa20: true,
      ma20Slope5dPct: 0.6,
    }),
    benchmarkFetcher: async () => ({ symbol: '^KS11', return20dPct: 3 }),
    investorFlow: {
      source: 'naver-finance',
      market: 'KOSPI',
      unit: '억원',
      latest: { date: '2026-05-11', foreign: 1200, institution: -300 },
      sums5d: { foreign: 4200, institution: 800 },
    },
  });

  assert.equal(report.candidates.length, 1);
  const state = markPreNewsSignalsSent(report, { alerts: [] });
  const filtered = filterAlreadyAlertedPreNews(report, state);
  assert.equal(filtered.candidates.length, 0);
});

test('formatPreNewsSignalReport explains data-first anomalies without claiming news prediction', async () => {
  const report = await buildPreNewsSignalReport({
    now,
    portfolio: { positions: [] },
    watchlist: { preopen: [], close: [] },
    recommendations: [{
      id: 'rec-1',
      name: '삼성전자',
      ticker: '005930',
      signal: 'bullish',
      createdAt: '2026-05-11T00:00:00.000Z',
      thesis: 'HBM 수요',
    }],
    fetcher: async () => ({
      symbol: '005930.KS',
      name: '삼성전자',
      price: 81000,
      breakout20d: true,
      near20dHigh: true,
      volumeRatio20d: 1.6,
      return20dPct: 10,
      movingAverage5d: 80000,
      movingAverage20d: 78000,
      distanceFromMa20Pct: 3.85,
      priceAboveMa5: true,
      priceAboveMa20: true,
      ma5AboveMa20: true,
      ma20Slope5dPct: 0.6,
    }),
    benchmarkFetcher: async () => ({ symbol: '^KS11', return20dPct: 3 }),
    investorFlow: {
      source: 'naver-finance',
      market: 'KOSPI',
      unit: '억원',
      latest: { date: '2026-05-11', foreign: 1200, institution: -300 },
      sums5d: { foreign: 4200, institution: 800 },
    },
  });
  const message = formatPreNewsSignalReport(report);

  assert.match(message, /가격·거래량 선행 이상징후/);
  assert.match(message, /삼성전자/);
  assert.match(message, /거래량 1.6배/);
  assert.match(message, /기사 발생 예측.*판정이 아닙니다/);
  assert.match(message, /DART·기업 공시/);
  assert.match(message, /원인 확인 전 추격·전액 진입 금지/);
  assert.match(message, /KOSPI 투자자 순매수/);
  assert.match(message, /외국인 1,200억 순매수 · 기관 300억 순매도 · 합계 900억 순매수/);
  assert.match(message, /시장 전체 배경이며 개별 종목의 매매 주체나 급등락 원인을 뜻하지 않습니다/);
  assert.doesNotMatch(message, /기사 전 선행 신호/);
});

test('formatPreNewsSignalReport formats global candidate prices in USD', () => {
  const message = formatPreNewsSignalReport({
    date: '2026-05-27',
    universeCount: 1,
    candidates: [{
      symbol: 'MU',
      ticker: 'MU',
      name: 'Micron Technology',
      action: 'pre_news_candidate',
      sourceLabel: '관심',
      score: 5,
      reasons: ['당일 급등 +19.93%'],
      warnings: [],
      marketProfile: {
        price: 900.81,
        currency: 'USD',
      },
    }],
    watch: [],
  });

  assert.match(message, /현재가 \$900.81/);
  assert.doesNotMatch(message, /900\.81원/);
});
