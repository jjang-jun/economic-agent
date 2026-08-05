const test = require('node:test');
const assert = require('node:assert/strict');

const { generateDigest } = require('../src/analysis/digest');
const { formatMarketSnapshot } = require('../src/utils/ai-budget');
const {
  buildDigestMarketSignal,
  inspectSnapshotFreshness,
  reconcileDigestMood,
  resolveDigestSession,
} = require('../src/utils/digest-market');
const {
  buildDigestAudit,
  mergeDigestAudits,
} = require('../src/utils/daily-summary');
const {
  formatDigest,
} = require('../src/notify/reports');
const {
  getSymbolsForSession,
} = require('../src/utils/market-snapshot');

const NOW = new Date('2026-07-31T00:15:43.748Z');

function marketSnapshot() {
  return [
    {
      name: 'KOSPI',
      symbol: '^KS11',
      price: 5593.56,
      changePercent: -7.14,
      return20dPct: -34.01,
      currency: 'KRW',
      marketTime: '2026-07-30T09:05:40.000Z',
    },
    {
      name: 'KOSDAQ',
      symbol: '^KQ11',
      price: 644.78,
      changePercent: -8.65,
      return20dPct: -29.62,
      currency: 'KRW',
      marketTime: '2026-07-30T09:05:40.000Z',
    },
    {
      name: 'USD/KRW',
      symbol: 'KRW=X',
      price: 1428.08,
      changePercent: -0.98,
      return20dPct: -7.4,
      currency: 'KRW',
      marketTime: '2026-07-31T00:15:38.000Z',
    },
    {
      name: '삼성전자',
      symbol: '005930.KS',
      price: 250000,
      changePercent: 20.77,
      currency: 'KRW',
      marketTime: '2026-07-31T00:15:41.080Z',
    },
    {
      name: 'SK하이닉스',
      symbol: '000660.KS',
      price: 1620000,
      changePercent: 22.54,
      currency: 'KRW',
      marketTime: '2026-07-31T00:15:41.078Z',
    },
    {
      name: 'S&P 500 ETF',
      symbol: 'SPY',
      price: 741.69,
      changePercent: 1.68,
      return20dPct: -0.55,
      currency: 'USD',
      marketTime: '2026-07-30T20:00:00.000Z',
    },
    {
      name: 'Nasdaq 100 ETF',
      symbol: 'QQQ',
      price: 683.55,
      changePercent: 3.3,
      return20dPct: -5.74,
      currency: 'USD',
      marketTime: '2026-07-30T20:00:00.000Z',
    },
    {
      name: 'Semiconductor ETF',
      symbol: 'SOXX',
      price: 504.53,
      changePercent: 8.5,
      return20dPct: -15.87,
      currency: 'USD',
      marketTime: '2026-07-30T20:00:00.000Z',
    },
    {
      name: 'Micron Technology',
      symbol: 'MU',
      price: 874.66,
      changePercent: 18.36,
      return20dPct: -15.27,
      currency: 'USD',
      marketTime: '2026-07-30T20:00:01.000Z',
    },
    {
      name: 'NVIDIA',
      symbol: 'NVDA',
      price: 195.04,
      changePercent: 2.65,
      return20dPct: -1.29,
      currency: 'USD',
      marketTime: '2026-07-30T20:00:00.000Z',
    },
    {
      name: 'VIX',
      symbol: '^VIX',
      price: 17.09,
      changePercent: -17.28,
      return20dPct: 3.01,
      currency: 'USD',
      marketTime: '2026-07-30T20:15:01.000Z',
    },
    {
      name: 'WTI Oil',
      symbol: 'CL=F',
      price: 84.15,
      changePercent: -0.37,
      return20dPct: 22.7,
      currency: 'USD',
      marketTime: '2026-07-31T00:05:37.000Z',
    },
  ];
}

test('scheduled preopen digest switches to midday after the KRX open', () => {
  const resolved = resolveDigestSession('preopen', {
    now: NOW,
    scheduled: true,
  });
  assert.equal(resolved.session, 'midday');
  assert.equal(resolved.adjusted, true);
  assert.equal(resolved.reason, 'scheduled_preopen_arrived_after_krx_open');

  const manual = resolveDigestSession('preopen', {
    now: NOW,
    scheduled: false,
  });
  assert.equal(manual.session, 'preopen');
  assert.equal(manual.adjusted, false);
});

test('freshness check excludes prior-day domestic indexes during the live KRX session', () => {
  const snapshot = marketSnapshot();
  assert.equal(inspectSnapshotFreshness(snapshot[0], { now: NOW }).status, 'stale');
  assert.equal(inspectSnapshotFreshness(snapshot[3], { now: NOW }).status, 'fresh');
  assert.equal(inspectSnapshotFreshness(snapshot[6], { now: NOW }).status, 'fresh');
});

test('Monday preopen accepts the latest Friday US close across the weekend', () => {
  const freshness = inspectSnapshotFreshness({
    symbol: 'QQQ',
    marketTime: '2026-07-31T20:00:00.000Z',
  }, {
    now: new Date('2026-08-03T00:15:00.000Z'),
  });
  assert.equal(freshness.status, 'fresh');
  assert.equal(freshness.usableForMood, true);
});

test('midday snapshot keeps the domestic preopen board plus global risk assets', () => {
  const symbols = getSymbolsForSession('midday').map(item => item.symbol);
  assert.ok(symbols.includes('^KS11'));
  assert.ok(symbols.includes('^KQ11'));
  assert.ok(symbols.includes('005930.KS'));
  assert.ok(symbols.includes('000660.KS'));
  assert.ok(symbols.includes('QQQ'));
  assert.ok(symbols.includes('^VIX'));
  assert.equal(symbols.filter(symbol => symbol === 'KRW=X').length, 1);
});

test('market snapshot budget keeps VIX and labels stale quotes with as-of timestamps', () => {
  const lines = formatMarketSnapshot(marketSnapshot(), 10, { now: NOW, session: 'midday' });
  const text = lines.join('\n');
  assert.match(text, /Nasdaq 100 ETF .*3\.3%/);
  assert.match(text, /Semiconductor ETF .*8\.5%/);
  assert.match(text, /VIX .*?-17\.28%/);
  assert.match(text, /KOSPI .*STALE-exclude-from-current-mood/);
  assert.match(text, /as-of 2026-07-30 18:05 KST/);
});

test('strong fresh semiconductor rebound overrides a contradictory bearish AI mood', () => {
  const signal = buildDigestMarketSignal(marketSnapshot(), {
    now: NOW,
    session: 'midday',
  });
  assert.equal(signal.mood, 'bullish');
  assert.equal(signal.strength, 'strong');
  assert.equal(signal.trendMood, 'bearish');
  assert.equal(signal.staleCount, 2);
  assert.ok(signal.evidence.some(item => item.includes('Nasdaq 100 ETF +3.3%')));
  assert.ok(signal.evidence.some(item => item.includes('Semiconductor ETF +8.5%')));

  assert.deepEqual(reconcileDigestMood('bearish', signal), {
    aiMood: 'bearish',
    finalMood: 'bullish',
    overridden: true,
    reason: 'fresh_price_signal_bullish',
  });
});

test('digest prompt exposes freshness and final mood is reconciled before report formatting', async () => {
  let capturedPrompt = '';
  const digest = await generateDigest(
    [{ id: 'article-1', title: '반도체 급반등', score: 5, sentiment: 'bullish' }],
    {
      marketSnapshot: marketSnapshot(),
      investorFlow: {
        source: 'naver-finance',
        market: 'KOSPI',
        unit: '억원',
        latest: { date: '2026-08-03', foreign: 3200, institution: -1200, individual: -1900 },
        sums5d: { foreign: 8100, institution: 2400, individual: -10400 },
      },
    },
    'midday',
    {
      now: NOW,
      chatDetailed: async prompt => {
        capturedPrompt = prompt;
        return {
          text: JSON.stringify({
            headline: '반도체 반등에도 중기 추세 확인',
            market_mood: 'bearish',
            sections: [{
              title: '시장',
              summary: '단기 반등과 중기 약세가 충돌합니다.',
              sentiment: 'neutral',
            }],
            key_numbers: ['QQQ +3.3%'],
            watch_list: ['국내 반도체 강세 지속 여부'],
          }),
          metadata: { provider: 'qwen', model: 'qwen3.7-flash' },
        };
      },
    },
  );

  assert.match(capturedPrompt, /Current price mood: bullish \(strong/);
  assert.match(capturedPrompt, /Excluded stale quotes: KOSPI, KOSDAQ/);
  assert.match(capturedPrompt, /VIX .*?-17\.28%/);
  assert.equal(digest.market_mood, 'bullish');
  assert.equal(digest.marketMoodReview.overridden, true);

  const message = formatDigest(digest);
  assert.match(message, /호재/);
  assert.match(message, /단기 호재 · 중기 하락 추세 경계/);
  assert.match(message, /오래된 시세 2개 제외/);
  assert.match(message, /AI 초안 악재→호재 보정/);
  assert.match(message, /자금 흐름/);
  assert.match(message, /외국인 3,200억 순매수 · 기관 1,200억 순매도/);
});

test('daily summary audit preserves final and original AI mood by session', () => {
  const current = buildDigestAudit({
    session: 'midday',
    sessionName: '오전장 점검',
    headline: '반도체 반등',
    market_mood: 'bullish',
    marketMoodReview: {
      aiMood: 'bearish',
      finalMood: 'bullish',
      overridden: true,
    },
    marketSignal: { mood: 'bullish', strength: 'strong' },
    capitalFlow: { investorFlow: { date: '2026-08-03' } },
    aiMetadata: { generatedAt: NOW.toISOString() },
  });
  const merged = mergeDigestAudits(current, [
    { session: 'preopen', marketMood: 'neutral' },
    { session: 'midday', marketMood: 'bearish' },
  ]);

  assert.equal(current.aiMarketMood, 'bearish');
  assert.equal(current.marketMood, 'bullish');
  assert.equal(current.capitalFlow.investorFlow.date, '2026-08-03');
  assert.equal(merged.length, 2);
  assert.equal(merged[0].marketMood, 'bullish');
});
