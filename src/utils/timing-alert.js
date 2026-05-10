const fs = require('fs');
const path = require('path');
const { getKSTDate } = require('./article-archive');
const { buildMarketProfile, fetchRecommendationQuote } = require('./recommendation-market');
const { fetchBenchmarkQuote, normalizeYahooSymbol, isDomesticTicker } = require('../sources/price-provider');

const TIMING_ALERT_DIR = path.join(__dirname, '..', '..', 'data', 'timing-alerts');
const TIMING_ALERT_STATE_FILE = path.join(TIMING_ALERT_DIR, 'state.json');

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isRecent(recommendation, days = 3, now = new Date()) {
  const created = toTime(recommendation.createdAt || recommendation.date);
  if (!created) return false;
  return now.getTime() - created <= days * 24 * 60 * 60 * 1000;
}

function sameHolding(position, recommendation) {
  return Boolean(
    (recommendation.symbol && position.symbol === recommendation.symbol)
    || (recommendation.ticker && position.ticker === recommendation.ticker)
  );
}

function riskProfileOf(recommendation = {}) {
  return recommendation.riskProfile || recommendation.risk_profile || {};
}

function riskReviewOf(recommendation = {}) {
  return recommendation.riskReview || recommendation.risk_review || {};
}

function marketProfileOf(recommendation = {}) {
  return recommendation.marketProfile || recommendation.market_profile || {};
}

function suggestedAmount(recommendation = {}, portfolio = {}) {
  const risk = riskProfileOf(recommendation);
  if (typeof risk.suggestedAmount !== 'number') return null;
  if (typeof portfolio.maxNewBuyAmount === 'number') {
    return Math.min(risk.suggestedAmount, portfolio.maxNewBuyAmount);
  }
  return risk.suggestedAmount;
}

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildTimingConditions(entryTiming = {}) {
  if (entryTiming.action === 'breakout') {
    return [
      '20일 고점 돌파 유지',
      '거래량이 20일 평균 대비 1.2배 이상',
      '장 초반 급등 후 20일선 대비 +8% 이상 이격이면 보류',
    ];
  }
  if (entryTiming.action === 'pullback') {
    return [
      '20일선 위 유지',
      '20일선 대비 -1.5%~+3% 구간',
      '5일선 회복 또는 5일선 위 종가 확인',
    ];
  }
  if (entryTiming.action === 'wait_pullback') {
    return [
      '20일선 대비 +8% 미만으로 이격 축소',
      '5일선 위 유지 확인',
      '첫 매수는 예정금액의 30~40%만 사용',
    ];
  }
  if (entryTiming.action === 'avoid') {
    return [
      '20일선 회복 전까지 매수 금지',
      '5일선이 20일선 위로 돌아선 뒤 재검토',
    ];
  }
  return [
    '5일선/20일선 정렬 확인 대기',
    '거래량 증가 또는 눌림목 재진입 확인 후 판단',
  ];
}

function buildBuyPlan({ recommendation, marketProfile, portfolio }) {
  const amount = suggestedAmount(recommendation, portfolio);
  const price = typeof marketProfile.price === 'number'
    ? marketProfile.price
    : null;
  const firstAmount = amount ? Math.floor(amount * 0.4) : null;
  const firstQuantity = firstAmount && price
    ? Math.max(1, Math.floor(firstAmount / price))
    : null;

  return {
    suggestedAmount: amount,
    firstAmount,
    firstQuantity,
    splitRule: '1차 40%, 확인 후 2차 30%, 다음 날 추세 유지 시 3차 30%',
  };
}

function classifyTimingCandidate(recommendation, marketProfile, portfolio) {
  const entryTiming = marketProfile.entryTiming || {};
  const risk = riskProfileOf(recommendation);
  const review = riskReviewOf(recommendation);
  const blockers = [...(review.blockers || [])];
  const riskReward = risk.riskReward ?? null;
  const expectedLossPct = risk.expectedLossPct ?? null;
  const hasRiskApproval = review.action === 'candidate' || review.approved === true || risk.tradeable === true;
  const timingApproved = entryTiming.approved === true;
  const status = hasRiskApproval && timingApproved ? 'ready' : 'watch';

  if (!hasRiskApproval && blockers.length === 0) blockers.push('risk_review: candidate approval missing');
  if (!timingApproved) blockers.push(`entry_timing: ${entryTiming.label || entryTiming.action || '확인 대기'}`);

  return {
    id: recommendation.id || `${recommendation.date || getKSTDate()}:${recommendation.ticker}`,
    name: marketProfile.name || recommendation.name || recommendation.ticker || '',
    originalName: recommendation.name || '',
    ticker: recommendation.ticker || '',
    symbol: recommendation.symbol || normalizeYahooSymbol(recommendation.ticker || recommendation.symbol || ''),
    reason: recommendation.reason || recommendation.thesis || '',
    conviction: recommendation.conviction || '',
    riskReward,
    expectedLossPct,
    stopLossPrice: risk.stopLossPrice ?? null,
    entryReferencePrice: risk.entryReferencePrice ?? null,
    price: marketProfile.price ?? null,
    priceChangeFromEntryPct: risk.entryReferencePrice && marketProfile.price
      ? round(((marketProfile.price - risk.entryReferencePrice) / risk.entryReferencePrice) * 100)
      : null,
    status,
    entryTiming,
    marketProfile,
    buyPlan: buildBuyPlan({ recommendation, marketProfile, portfolio }),
    conditions: buildTimingConditions(entryTiming),
    blockers,
  };
}

function selectTimingRecommendations(recommendations = [], portfolio = {}, options = {}) {
  const now = options.now || new Date();
  const positions = portfolio.positions || [];
  const days = options.days || 3;
  const maxCandidates = options.maxCandidates || 8;

  return (recommendations || [])
    .filter(item => item.signal === 'bullish')
    .filter(item => isRecent(item, days, now))
    .filter(item => isDomesticTicker(item.ticker || item.symbol || ''))
    .filter(item => !(positions || []).some(position => sameHolding(position, item)))
    .sort((a, b) => (
      ({ high: 3, medium: 2, low: 1 }[b.conviction] || 0) - ({ high: 3, medium: 2, low: 1 }[a.conviction] || 0)
      || ((riskProfileOf(b).riskReward || 0) - (riskProfileOf(a).riskReward || 0))
      || toTime(b.createdAt || b.date) - toTime(a.createdAt || a.date)
    ))
    .slice(0, maxCandidates);
}

async function buildTimingAlertReport({ recommendations = [], portfolio = {}, mode = 'intraday', now = new Date(), fetcher = fetchRecommendationQuote, benchmarkFetcher = fetchBenchmarkQuote } = {}) {
  const selected = selectTimingRecommendations(recommendations, portfolio, { now });
  const benchmark = await benchmarkFetcher();
  const candidates = [];

  for (const recommendation of selected) {
    const symbol = normalizeYahooSymbol(recommendation.ticker || recommendation.symbol || '');
    const quote = symbol ? await fetcher(symbol) : null;
    const marketProfile = quote
      ? buildMarketProfile(quote, benchmark)
      : marketProfileOf(recommendation);
    if (!marketProfile) continue;
    candidates.push(classifyTimingCandidate(recommendation, marketProfile, portfolio));
  }

  const readyCandidates = candidates.filter(item => item.status === 'ready');
  return {
    id: `${getKSTDate(now)}:timing-alert:${mode}`,
    date: getKSTDate(now),
    createdAt: now.toISOString(),
    mode,
    candidates: mode === 'intraday' ? readyCandidates : candidates,
    watchCandidates: candidates.filter(item => item.status !== 'ready'),
    readyCount: readyCandidates.length,
  };
}

function loadTimingAlertState(file = TIMING_ALERT_STATE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return { alerts: [] };
  }
}

function saveTimingAlertState(state, file = TIMING_ALERT_STATE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function alertKey(candidate, date) {
  return `${date}:${candidate.symbol || candidate.ticker}:${candidate.entryTiming?.action || 'unknown'}`;
}

function filterAlreadyAlerted(report, state = loadTimingAlertState()) {
  const sent = new Set((state.alerts || []).map(item => item.key));
  return {
    ...report,
    candidates: (report.candidates || []).filter(candidate => !sent.has(alertKey(candidate, report.date))),
  };
}

function markTimingAlertsSent(report, state = loadTimingAlertState()) {
  const now = new Date().toISOString();
  const alerts = [...(state.alerts || [])];
  for (const candidate of report.candidates || []) {
    alerts.push({
      key: alertKey(candidate, report.date),
      date: report.date,
      symbol: candidate.symbol || candidate.ticker,
      action: candidate.entryTiming?.action || '',
      sentAt: now,
    });
  }
  return { alerts: alerts.slice(-500) };
}

module.exports = {
  TIMING_ALERT_STATE_FILE,
  buildTimingAlertReport,
  classifyTimingCandidate,
  selectTimingRecommendations,
  buildTimingConditions,
  filterAlreadyAlerted,
  markTimingAlertsSent,
  loadTimingAlertState,
  saveTimingAlertState,
  alertKey,
};
