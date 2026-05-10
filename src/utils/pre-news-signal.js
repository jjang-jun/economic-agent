const fs = require('fs');
const path = require('path');
const WATCHLIST = require('../config/watchlist');
const { getKSTDate } = require('./article-archive');
const { buildMarketProfile, fetchRecommendationQuote } = require('./recommendation-market');
const { fetchBenchmarkQuote, isDomesticTicker, normalizeYahooSymbol } = require('../sources/price-provider');

const PRE_NEWS_SIGNAL_DIR = path.join(__dirname, '..', '..', 'data', 'pre-news-signals');
const PRE_NEWS_SIGNAL_STATE_FILE = path.join(PRE_NEWS_SIGNAL_DIR, 'state.json');

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isRecent(recommendation, days = 7, now = new Date()) {
  const created = toTime(recommendation.createdAt || recommendation.date);
  return Boolean(created && now.getTime() - created <= days * 24 * 60 * 60 * 1000);
}

function normalizeDomesticSymbol(value = '') {
  const raw = String(value || '').trim();
  if (!isDomesticTicker(raw)) return '';
  return normalizeYahooSymbol(raw);
}

function addUniverseItem(map, item = {}) {
  const symbol = normalizeDomesticSymbol(item.symbol || item.ticker || '');
  if (!symbol) return;
  const existing = map.get(symbol) || {
    symbol,
    ticker: symbol.slice(0, 6),
    name: '',
    sources: [],
    recommendationIds: [],
    thesis: '',
  };
  if (item.name && !existing.name) existing.name = item.name;
  if (item.source && !existing.sources.includes(item.source)) existing.sources.push(item.source);
  if (item.recommendationId && !existing.recommendationIds.includes(item.recommendationId)) {
    existing.recommendationIds.push(item.recommendationId);
  }
  if (item.thesis && !existing.thesis) existing.thesis = item.thesis;
  map.set(symbol, existing);
}

function buildPreNewsUniverse({ recommendations = [], portfolio = {}, watchlist = WATCHLIST, now = new Date(), maxWatchlist = 20 } = {}) {
  const map = new Map();

  for (const position of portfolio.positions || []) {
    addUniverseItem(map, {
      name: position.name,
      ticker: position.ticker || position.symbol,
      source: 'holding',
      thesis: position.thesis,
    });
  }

  for (const recommendation of recommendations || []) {
    if (!isRecent(recommendation, 7, now)) continue;
    addUniverseItem(map, {
      name: recommendation.name,
      ticker: recommendation.ticker || recommendation.symbol,
      source: 'recent_recommendation',
      recommendationId: recommendation.id,
      thesis: recommendation.thesis || recommendation.reason,
    });
  }

  const domesticWatchlist = [
    ...(watchlist.preopen || []),
    ...(watchlist.close || []),
  ].filter(item => isDomesticTicker(item.symbol));
  for (const item of domesticWatchlist.slice(0, maxWatchlist)) {
    addUniverseItem(map, {
      name: item.name,
      ticker: item.symbol,
      source: 'watchlist',
    });
  }

  return [...map.values()];
}

function sourceLabel(sources = []) {
  const labels = {
    holding: '보유',
    recent_recommendation: '최근 추천',
    watchlist: '관심',
  };
  return sources.map(source => labels[source] || source).join('/');
}

function scorePreNewsSignal(item, marketProfile = {}) {
  const reasons = [];
  const warnings = [];
  let score = 0;

  if (marketProfile.breakout20d) {
    score += 2;
    reasons.push('20일 고점 돌파');
  } else if (marketProfile.near20dHigh) {
    score += 1;
    reasons.push('20일 고점 근접');
  }

  if (typeof marketProfile.volumeRatio20d === 'number') {
    if (marketProfile.volumeRatio20d >= 1.5) {
      score += 2;
      reasons.push(`거래량 ${marketProfile.volumeRatio20d}배`);
    } else if (marketProfile.volumeRatio20d >= 1.2) {
      score += 1;
      reasons.push(`거래량 ${marketProfile.volumeRatio20d}배`);
    }
  }

  if (typeof marketProfile.relativeStrength20d === 'number') {
    if (marketProfile.relativeStrength20d >= 5) {
      score += 2;
      reasons.push(`시장 대비 20일 +${marketProfile.relativeStrength20d}%p`);
    } else if (marketProfile.relativeStrength20d >= 2) {
      score += 1;
      reasons.push(`시장 대비 20일 +${marketProfile.relativeStrength20d}%p`);
    } else if (marketProfile.relativeStrength20d < 0) {
      warnings.push(`시장 대비 약세 ${marketProfile.relativeStrength20d}%p`);
    }
  }

  if (marketProfile.priceAboveMa5 && marketProfile.priceAboveMa20) {
    score += 1;
    reasons.push('5일선/20일선 위');
  }
  if (marketProfile.ma5AboveMa20) {
    score += 1;
    reasons.push('5일선이 20일선 위');
  }
  if (typeof marketProfile.ma20Slope5dPct === 'number' && marketProfile.ma20Slope5dPct > 0) {
    score += 1;
    reasons.push(`20일선 기울기 +${marketProfile.ma20Slope5dPct}%`);
  }

  if (typeof marketProfile.distanceFromMa20Pct === 'number' && marketProfile.distanceFromMa20Pct >= 8) {
    score -= 1;
    warnings.push(`20일선 대비 ${marketProfile.distanceFromMa20Pct}% 이격: 추격 금지`);
  }
  if (marketProfile.priceAboveMa20 === false) {
    score -= 2;
    warnings.push('20일선 아래');
  }

  const action = score >= 5 && !warnings.some(text => text.includes('추격 금지'))
    ? 'pre_news_candidate'
    : (score >= 3 ? 'watch' : 'ignore');

  return {
    symbol: item.symbol,
    ticker: item.ticker,
    name: marketProfile.name || item.name || item.ticker,
    originalName: item.name || '',
    sources: item.sources || [],
    sourceLabel: sourceLabel(item.sources || []),
    recommendationIds: item.recommendationIds || [],
    thesis: item.thesis || '',
    score,
    action,
    reasons,
    warnings,
    marketProfile,
  };
}

async function buildPreNewsSignalReport({
  recommendations = [],
  portfolio = {},
  watchlist = WATCHLIST,
  now = new Date(),
  fetcher = fetchRecommendationQuote,
  benchmarkFetcher = fetchBenchmarkQuote,
} = {}) {
  const universe = buildPreNewsUniverse({ recommendations, portfolio, watchlist, now });
  const benchmark = await benchmarkFetcher();
  const signals = [];

  for (const item of universe) {
    const quote = await fetcher(item.symbol);
    if (!quote) continue;
    const marketProfile = buildMarketProfile(quote, benchmark);
    const signal = scorePreNewsSignal(item, marketProfile);
    if (signal.action !== 'ignore') signals.push(signal);
  }

  signals.sort((a, b) => b.score - a.score);
  return {
    id: `${getKSTDate(now)}:pre-news-signal`,
    date: getKSTDate(now),
    createdAt: now.toISOString(),
    universeCount: universe.length,
    signals,
    candidates: signals.filter(item => item.action === 'pre_news_candidate'),
    watch: signals.filter(item => item.action === 'watch'),
  };
}

function loadPreNewsSignalState(file = PRE_NEWS_SIGNAL_STATE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return { alerts: [] };
  }
}

function savePreNewsSignalState(state, file = PRE_NEWS_SIGNAL_STATE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function preNewsAlertKey(signal, date) {
  return `${date}:${signal.symbol}:${signal.action}`;
}

function filterAlreadyAlertedPreNews(report, state = loadPreNewsSignalState()) {
  const sent = new Set((state.alerts || []).map(item => item.key));
  return {
    ...report,
    candidates: (report.candidates || []).filter(signal => !sent.has(preNewsAlertKey(signal, report.date))),
  };
}

function markPreNewsSignalsSent(report, state = loadPreNewsSignalState()) {
  const now = new Date().toISOString();
  const alerts = [...(state.alerts || [])];
  for (const signal of report.candidates || []) {
    alerts.push({
      key: preNewsAlertKey(signal, report.date),
      date: report.date,
      symbol: signal.symbol,
      action: signal.action,
      sentAt: now,
    });
  }
  return { alerts: alerts.slice(-500) };
}

module.exports = {
  PRE_NEWS_SIGNAL_STATE_FILE,
  buildPreNewsUniverse,
  buildPreNewsSignalReport,
  scorePreNewsSignal,
  filterAlreadyAlertedPreNews,
  markPreNewsSignalsSent,
  loadPreNewsSignalState,
  savePreNewsSignalState,
  preNewsAlertKey,
};
