const fs = require('fs');
const path = require('path');
const { fetchCurrentPrice } = require('../sources/price-provider');
const { sendTelegramMessage } = require('../notify/telegram');
const {
  loadAlertEventsForArticles,
  persistAlertEvents,
  persistMarketSnapshots,
} = require('./persistence');

const STATE_FILE = path.join(__dirname, '..', '..', 'data', 'market-stress-alert-state.json');
const MARKETS = [
  { symbol: '^KS11', name: 'KOSPI' },
  { symbol: '^KQ11', name: 'KOSDAQ' },
];
const LEVELS = [
  {
    id: 'warning',
    rank: 1,
    thresholdPct: Number(process.env.MARKET_STRESS_WARNING_PCT || -3),
    label: '경계',
    icon: '⚠️',
  },
  {
    id: 'severe',
    rank: 2,
    thresholdPct: Number(process.env.MARKET_STRESS_SEVERE_PCT || -5),
    label: '위기',
    icon: '🚨',
  },
  {
    id: 'circuit_breaker',
    rank: 3,
    thresholdPct: Number(process.env.MARKET_STRESS_CIRCUIT_BREAKER_PCT || -8),
    label: '서킷브레이커 기준',
    icon: '🛑',
  },
].sort((a, b) => a.rank - b.rank);

function getKstClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday'),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function isMarketStressWindow(now = new Date()) {
  const clock = getKstClock(now);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(clock.weekday)
    && clock.minutes >= 9 * 60
    && clock.minutes <= 15 * 60 + 40;
}

function classifyMarketStress(changePercent) {
  if (typeof changePercent !== 'number' || !Number.isFinite(changePercent)) return null;
  return [...LEVELS]
    .sort((a, b) => b.rank - a.rank)
    .find(level => changePercent <= level.thresholdPct) || null;
}

function buildAlertId(date, symbol, levelId) {
  const market = String(symbol || '').replace(/[^0-9A-Za-z]/g, '').toLowerCase();
  return `market-stress:${date}:${market}:${levelId}`;
}

function loadLocalState(file = STATE_FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [] };
  } catch {
    return { alerts: [] };
  }
}

function saveLocalState(state, file = STATE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function hasSentEqualOrHigher({ rows = [], state = {}, date, symbol, level }) {
  const sentIds = new Set([
    ...rows.filter(row => row.status === 'sent').map(row => row.article_id),
    ...(state.alerts || []).map(row => row.id),
  ]);
  return LEVELS
    .filter(candidate => candidate.rank >= level.rank)
    .some(candidate => sentIds.has(buildAlertId(date, symbol, candidate.id)));
}

function formatMarketStressAlert({ market, quote, level }) {
  const change = Number(quote.changePercent).toFixed(2);
  const price = Number(quote.price).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  const actions = level.rank >= 3
    ? [
        '신규매수·물타기 중단',
        '레버리지/신용 노출과 보유 손절선 즉시 확인',
        '거래소 실제 발동 여부와 재개 시각 확인 후 대응',
      ]
    : level.rank === 2
      ? [
          '신규매수 보류, 현금·레버리지 비중 점검',
          '보유 종목 손절선/집중도를 확인하고 충동 매매 금지',
        ]
      : [
          '추격매수 중단, 장중 낙폭 확대 여부 관찰',
          '보유 집중도와 당일 손절 기준 사전 점검',
        ];
  const circuitNote = level.rank >= 3
    ? '\n※ KRX 1단계 기준은 -8% 상태가 1분 지속될 때이며, 이 알림은 가격 임계치 도달 감지입니다.'
    : '';

  return [
    `${level.icon} <b>${market.name} 시장 급락 ${level.label}</b>`,
    `지수 ${price} · 전일 대비 <b>${change}%</b>`,
    '',
    ...actions.map(action => `▸ ${action}`),
    circuitNote,
    '',
    `<i>미래 하락을 예측한 신호가 아니라 현재 가격의 단계별 조기 감지입니다. 시세 출처: ${quote.source || 'unknown'}</i>`,
  ].filter(Boolean).join('\n');
}

async function monitorMarketStress(options = {}) {
  const now = options.now || new Date();
  if (process.env.MARKET_STRESS_ALERTS_ENABLED === 'false' || !isMarketStressWindow(now)) {
    return { checked: false, sent: 0, reason: 'outside_market_window_or_disabled' };
  }

  const quoteFetcher = options.quoteFetcher || fetchCurrentPrice;
  const alertSender = options.alertSender || sendTelegramMessage;
  const alertLoader = options.alertLoader || loadAlertEventsForArticles;
  const alertPersister = options.alertPersister || persistAlertEvents;
  const snapshotPersister = options.snapshotPersister || persistMarketSnapshots;
  const stateFile = options.stateFile || STATE_FILE;
  const clock = getKstClock(now);
  const state = loadLocalState(stateFile);
  const quotes = [];

  for (const market of MARKETS) {
    const quote = await quoteFetcher(market.symbol);
    if (quote && typeof quote.changePercent === 'number') {
      quotes.push({ market, quote });
    }
  }
  await snapshotPersister(
    quotes.map(({ market, quote }) => ({ ...quote, name: market.name })),
    'intraday_stress',
    now.toISOString(),
  );

  const allCandidateIds = quotes.flatMap(({ market }) => (
    LEVELS.map(level => buildAlertId(clock.date, market.symbol, level.id))
  ));
  const rows = await alertLoader(allCandidateIds);
  let sent = 0;

  for (const { market, quote } of quotes) {
    const level = classifyMarketStress(quote.changePercent);
    if (!level || hasSentEqualOrHigher({ rows, state, date: clock.date, symbol: market.symbol, level })) {
      continue;
    }

    const articleId = buildAlertId(clock.date, market.symbol, level.id);
    const payload = {
      type: 'market_stress',
      date: clock.date,
      market,
      level,
      quote,
    };
    try {
      await alertSender(formatMarketStressAlert({ market, quote, level }), {
        channel: 'private',
        requireDelivery: true,
      });
      sent++;
      state.alerts.push({ id: articleId, sentAt: now.toISOString() });
      await alertPersister([{
        articleId,
        alertType: 'market_stress',
        status: 'sent',
        sentAt: now.toISOString(),
        payload,
      }]);
    } catch (error) {
      await alertPersister([{
        articleId,
        alertType: 'market_stress',
        status: 'failed',
        payload: { ...payload, error: error.message },
      }]);
      throw error;
    }
  }

  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  state.alerts = state.alerts
    .filter(item => new Date(item.sentAt || 0).getTime() >= cutoff)
    .slice(-100);
  saveLocalState(state, stateFile);
  return { checked: true, sent, quoteCount: quotes.length };
}

module.exports = {
  LEVELS,
  MARKETS,
  STATE_FILE,
  getKstClock,
  isMarketStressWindow,
  classifyMarketStress,
  buildAlertId,
  hasSentEqualOrHigher,
  formatMarketStressAlert,
  monitorMarketStress,
};
