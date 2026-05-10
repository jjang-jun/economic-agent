const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPreNewsUniverse,
  buildPreNewsSignalReport,
  filterAlreadyAlertedPreNews,
  markPreNewsSignalsSent,
  scorePreNewsSignal,
} = require('../src/utils/pre-news-signal');
const { formatPreNewsSignalReport } = require('../src/notify/telegram');

const now = new Date('2026-05-11T01:05:00.000Z');

test('buildPreNewsUniverse uses holdings, recent recommendations, and domestic watchlist only', () => {
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
    },
  });

  assert.deepEqual(universe.map(item => item.symbol).sort(), ['000660.KS', '005930.KS', '396500.KS']);
  assert.ok(universe.find(item => item.symbol === '005930.KS').sources.includes('recent_recommendation'));
  assert.ok(universe.find(item => item.symbol === '396500.KS').sources.includes('holding'));
});

test('scorePreNewsSignal promotes public price and volume strength', () => {
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

  assert.equal(signal.action, 'pre_news_candidate');
  assert.equal(signal.name, '삼성전자');
  assert.equal(signal.originalName, '삼성전자');
  assert.ok(signal.score >= 5);
  assert.ok(signal.reasons.some(item => item.includes('20일 고점 돌파')));
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
  });

  assert.equal(report.candidates.length, 1);
  const state = markPreNewsSignalsSent(report, { alerts: [] });
  const filtered = filterAlreadyAlertedPreNews(report, state);
  assert.equal(filtered.candidates.length, 0);
});

test('formatPreNewsSignalReport explains candidates in Korean', async () => {
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
  });
  const message = formatPreNewsSignalReport(report);

  assert.match(message, /기사 전 선행 신호/);
  assert.match(message, /삼성전자/);
  assert.match(message, /거래량 1.6배/);
  assert.match(message, /공시·뉴스 확인 전 전액 진입 금지/);
});
