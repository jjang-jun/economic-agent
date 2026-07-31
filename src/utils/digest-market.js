const MARKET_TIME_ZONE = 'Asia/Seoul';

const SNAPSHOT_PRIORITY = new Map([
  ['^KS11', 10],
  ['^KQ11', 20],
  ['KRW=X', 30],
  ['005930.KS', 40],
  ['000660.KS', 50],
  ['SPY', 60],
  ['QQQ', 70],
  ['SOXX', 80],
  ['^VIX', 90],
  ['CL=F', 100],
  ['DX-Y.NYB', 110],
  ['MU', 120],
  ['NVDA', 130],
  ['AMD', 140],
  ['TSM', 150],
  ['HG=F', 160],
  ['GC=F', 170],
]);

const PRICE_SIGNAL_RULES = new Map([
  ['^KS11', { weight: 1.5, scale: 1 }],
  ['^KQ11', { weight: 1.2, scale: 1 }],
  ['005930.KS', { weight: 0.8, scale: 3 }],
  ['000660.KS', { weight: 0.8, scale: 3 }],
  ['SPY', { weight: 1.2, scale: 1 }],
  ['QQQ', { weight: 1.4, scale: 1 }],
  ['SOXX', { weight: 1.2, scale: 2 }],
  ['MU', { weight: 0.5, scale: 3 }],
  ['NVDA', { weight: 0.5, scale: 3 }],
  ['AMD', { weight: 0.5, scale: 3 }],
  ['TSM', { weight: 0.5, scale: 3 }],
  ['^VIX', { weight: 1, scale: 5, invert: true }],
]);

const TREND_SYMBOLS = new Set([
  '^KS11',
  '^KQ11',
  'SPY',
  'QQQ',
  'SOXX',
  '005930.KS',
  '000660.KS',
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getKstClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function isDomesticSymbol(symbol = '') {
  return symbol === '^KS11'
    || symbol === '^KQ11'
    || symbol.endsWith('.KS')
    || symbol.endsWith('.KQ');
}

function isKstWeekday(clock) {
  return !['Sat', 'Sun'].includes(clock.weekday);
}

function isDomesticMarketOpen(now = new Date()) {
  const clock = getKstClock(now);
  return isKstWeekday(clock) && clock.minutes >= 9 * 60 && clock.minutes <= 15 * 60 + 30;
}

function inspectSnapshotFreshness(item, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const marketTime = item?.marketTime ? new Date(item.marketTime) : null;
  if (!marketTime || Number.isNaN(marketTime.getTime())) {
    return {
      status: 'unknown',
      ageMinutes: null,
      usableForMood: false,
      weight: 0,
    };
  }

  const ageMinutes = Math.max(0, Math.round((now.getTime() - marketTime.getTime()) / 60_000));
  const currentClock = getKstClock(now);
  const marketClock = getKstClock(marketTime);

  if (isDomesticSymbol(item.symbol)) {
    if (isDomesticMarketOpen(now)) {
      const fresh = currentClock.date === marketClock.date && ageMinutes <= 30;
      return {
        status: fresh ? 'fresh' : 'stale',
        ageMinutes,
        usableForMood: fresh,
        weight: fresh ? 1 : 0,
      };
    }

    const sameKstDate = currentClock.date === marketClock.date;
    if (sameKstDate && ageMinutes <= 12 * 60) {
      return {
        status: 'fresh',
        ageMinutes,
        usableForMood: true,
        weight: 1,
      };
    }

    const previousClose = ageMinutes <= 96 * 60;
    return {
      status: previousClose ? 'previous_close' : 'stale',
      ageMinutes,
      usableForMood: previousClose,
      weight: previousClose ? 0.35 : 0,
    };
  }

  // 월요일 아침에는 금요일 미국 종가가 최신 유효 종가다.
  // 휴장/주말 간격은 허용하되 4일을 넘긴 값은 현재 분위기에서 제외한다.
  const maxAgeMinutes = 96 * 60;
  const fresh = ageMinutes <= maxAgeMinutes;
  return {
    status: fresh ? 'fresh' : 'stale',
    ageMinutes,
    usableForMood: fresh,
    weight: fresh ? 1 : 0,
  };
}

function selectMarketSnapshotItems(snapshot = [], maxItems = snapshot.length) {
  return snapshot
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aPriority = SNAPSHOT_PRIORITY.get(a.item?.symbol) ?? 1_000;
      const bPriority = SNAPSHOT_PRIORITY.get(b.item?.symbol) ?? 1_000;
      return aPriority - bPriority || a.index - b.index;
    })
    .slice(0, maxItems)
    .map(entry => entry.item);
}

function moodFromScore(score) {
  if (score >= 2) return 'bullish';
  if (score <= -2) return 'bearish';
  return 'neutral';
}

function buildDigestMarketSignal(snapshot = [], options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const components = [];
  const stale = [];

  for (const item of snapshot) {
    const rule = PRICE_SIGNAL_RULES.get(item?.symbol);
    if (!rule || typeof item?.changePercent !== 'number') continue;

    const freshness = inspectSnapshotFreshness(item, { now });
    if (!freshness.usableForMood) {
      stale.push({
        symbol: item.symbol,
        name: item.name || item.symbol,
        status: freshness.status,
        ageMinutes: freshness.ageMinutes,
      });
      continue;
    }

    const direction = rule.invert ? -item.changePercent : item.changePercent;
    const contribution = clamp(direction / rule.scale, -2, 2)
      * rule.weight
      * freshness.weight;
    components.push({
      symbol: item.symbol,
      name: item.name || item.symbol,
      changePercent: item.changePercent,
      contribution,
      freshness: freshness.status,
      marketTime: item.marketTime || null,
    });
  }

  const score = Number(components.reduce((sum, item) => sum + item.contribution, 0).toFixed(2));
  const bullishCount = components.filter(item => item.contribution >= 0.25).length;
  const bearishCount = components.filter(item => item.contribution <= -0.25).length;
  const mood = moodFromScore(score);
  const strength = Math.abs(score) >= 4
    && (mood === 'bullish' ? bullishCount : bearishCount) >= 3
    ? 'strong'
    : Math.abs(score) >= 2
      ? 'moderate'
      : 'weak';

  const trendValues = snapshot
    .filter(item => TREND_SYMBOLS.has(item?.symbol) && typeof item.return20dPct === 'number')
    .map(item => item.return20dPct);
  const trendAverage = trendValues.length > 0
    ? Number((trendValues.reduce((sum, value) => sum + value, 0) / trendValues.length).toFixed(2))
    : null;
  const trendMood = trendAverage === null
    ? 'neutral'
    : moodFromScore(trendAverage / 2);

  const evidence = [...components]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5)
    .map(item => `${item.name} ${item.changePercent >= 0 ? '+' : ''}${item.changePercent}%`);

  return {
    mood,
    strength,
    score,
    trendMood,
    trendAverage,
    freshCount: components.filter(item => item.freshness === 'fresh').length,
    previousCloseCount: components.filter(item => item.freshness === 'previous_close').length,
    staleCount: stale.length,
    bullishCount,
    bearishCount,
    evidence,
    stale,
    generatedAt: now.toISOString(),
  };
}

function reconcileDigestMood(aiMood, signal) {
  const normalizedAiMood = ['bullish', 'bearish', 'neutral'].includes(aiMood)
    ? aiMood
    : 'neutral';
  const shouldOverride = signal?.strength === 'strong'
    && signal.mood !== 'neutral'
    && normalizedAiMood !== signal.mood;

  return {
    aiMood: normalizedAiMood,
    finalMood: shouldOverride ? signal.mood : normalizedAiMood,
    overridden: shouldOverride,
    reason: shouldOverride
      ? `fresh_price_signal_${signal.mood}`
      : 'ai_mood_consistent_or_price_signal_not_strong',
  };
}

function formatMarketSignalForPrompt(signal) {
  if (!signal) return '(No deterministic price signal)';
  const staleNames = (signal.stale || []).slice(0, 4).map(item => item.name).join(', ');
  return [
    `Current price mood: ${signal.mood} (${signal.strength}, score ${signal.score})`,
    `Medium-term trend: ${signal.trendMood}${signal.trendAverage === null ? '' : ` (20d avg ${signal.trendAverage}%)`}`,
    `Fresh breadth: bullish ${signal.bullishCount}, bearish ${signal.bearishCount}`,
    signal.evidence?.length ? `Evidence: ${signal.evidence.join(', ')}` : '',
    staleNames ? `Excluded stale quotes: ${staleNames}` : '',
  ].filter(Boolean).join('\n');
}

function detectDigestSession(now = new Date()) {
  const hour = getKstClock(now).hour;
  if (hour < 9) return 'preopen';
  if (hour < 13) return 'midday';
  if (hour < 16) return 'close';
  if (hour < 20) return 'europe';
  return 'usopen';
}

function resolveDigestSession(requestedSession, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const actualSession = detectDigestSession(now);
  const scheduled = options.scheduled === true;
  const shouldSwitch = scheduled
    && requestedSession === 'preopen'
    && actualSession === 'midday';

  return {
    requestedSession,
    session: shouldSwitch ? actualSession : requestedSession,
    actualSession,
    adjusted: shouldSwitch,
    reason: shouldSwitch ? 'scheduled_preopen_arrived_after_krx_open' : null,
    resolvedAt: now.toISOString(),
  };
}

module.exports = {
  buildDigestMarketSignal,
  detectDigestSession,
  formatMarketSignalForPrompt,
  getKstClock,
  inspectSnapshotFreshness,
  isDomesticMarketOpen,
  reconcileDigestMood,
  resolveDigestSession,
  selectMarketSnapshotItems,
};
