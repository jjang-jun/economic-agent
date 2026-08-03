const fs = require('fs');
const path = require('path');
const WATCHLIST = require('../config/watchlist');
const { getKSTDate } = require('./article-archive');
const { buildMarketProfile, fetchRecommendationQuote } = require('./recommendation-market');
const { fetchBenchmarkQuote, isDomesticTicker, normalizeYahooSymbol } = require('../sources/price-provider');
const { buildCapitalFlowSnapshot } = require('./capital-flow-report');

const PRE_NEWS_SIGNAL_DIR = path.join(__dirname, '..', '..', 'data', 'pre-news-signals');
const PRE_NEWS_SIGNAL_STATE_FILE = path.join(PRE_NEWS_SIGNAL_DIR, 'state.json');
const DEFAULT_EVIDENCE_LOOKBACK_HOURS = 12;

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isRecent(recommendation, days = 7, now = new Date()) {
  const created = toTime(recommendation.createdAt || recommendation.date);
  return Boolean(created && now.getTime() - created <= days * 24 * 60 * 60 * 1000);
}

function normalizeUniverseSymbol(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isDomesticTicker(raw)) return normalizeYahooSymbol(raw);
  if (raw.startsWith('^') || raw.includes('=') || raw.includes('/')) return '';
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/i.test(raw)) return '';
  return raw.toUpperCase();
}

function addUniverseItem(map, item = {}) {
  const symbol = normalizeUniverseSymbol(item.symbol || item.ticker || '');
  if (!symbol) return;
  const existing = map.get(symbol) || {
    symbol,
    ticker: isDomesticTicker(symbol) ? symbol.slice(0, 6) : symbol,
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
    ...(watchlist.domesticMomentum || []),
  ].filter(item => isDomesticTicker(item.symbol));
  for (const item of domesticWatchlist.slice(0, maxWatchlist)) {
    addUniverseItem(map, {
      name: item.name,
      ticker: item.symbol,
      source: 'watchlist',
    });
  }

  const globalWatchlist = [
    ...(watchlist.globalMomentum || []),
  ].filter(item => normalizeUniverseSymbol(item.symbol) && !isDomesticTicker(item.symbol));
  for (const item of globalWatchlist.slice(0, maxWatchlist)) {
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

function normalizeEvidenceText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function articleEvidenceText(article = {}) {
  const disclosure = article.disclosure || {};
  return normalizeEvidenceText([
    article.title,
    article.titleKo,
    article.summary,
    article.reason,
    disclosure.corpName,
    disclosure.corp_name,
    disclosure.stockCode,
    disclosure.stock_code,
  ].filter(Boolean).join(' '));
}

function signalEvidenceTerms(signal = {}) {
  const terms = new Set();
  const genericNameTokens = new Set([
    'company', 'corporation', 'corp', 'group', 'holdings', 'holding', 'inc',
    'limited', 'ltd', 'technology', 'technologies',
  ]);
  const ticker = String(signal.ticker || '').replace(/\.(KS|KQ)$/i, '');
  if (/^\d{6}$/.test(ticker)) terms.add(ticker);
  const name = normalizeEvidenceText(signal.name || signal.originalName || '');
  if (name.length >= 2) terms.add(name);
  for (const token of name.split(' ')) {
    if ((/^[a-z0-9]{4,}$/.test(token) && !genericNameTokens.has(token)) || /^[가-힣]{2,}$/.test(token)) {
      terms.add(token);
    }
  }
  return [...terms];
}

function articleMatchesSignal(article, signal) {
  const text = articleEvidenceText(article);
  if (!text) return false;
  return signalEvidenceTerms(signal).some(term => text.includes(term));
}

function classifySignalEvidence(signal, articles = [], options = {}) {
  const detectedAt = options.detectedAt || new Date().toISOString();
  if (options.dataAvailable !== true) {
    return {
      status: 'evidence_unavailable',
      detectedAt,
      lookbackHours: Number(options.lookbackHours || DEFAULT_EVIDENCE_LOOKBACK_HOURS),
      relatedArticles: [],
      sameDayUnknownTimeCount: 0,
    };
  }
  const detectedTime = toTime(detectedAt);
  const lookbackHours = Number(options.lookbackHours || DEFAULT_EVIDENCE_LOOKBACK_HOURS);
  const windowStartTime = detectedTime - lookbackHours * 60 * 60 * 1000;
  const matches = [];
  let sameDayUnknownTimeCount = 0;

  for (const article of articles) {
    if (!articleMatchesSignal(article, signal)) continue;
    const precision = article.pubDatePrecision || 'datetime';
    const publishedTime = toTime(article.pubDate);
    if (precision === 'date' || !publishedTime) {
      if (String(article.pubDate || '').slice(0, 10) === getKSTDate(new Date(detectedAt))) {
        sameDayUnknownTimeCount++;
      }
      continue;
    }
    if (publishedTime < windowStartTime || publishedTime > detectedTime) continue;
    matches.push({
      id: article.id || '',
      title: article.titleKo || article.title || '',
      source: article.source || '',
      pubDate: article.pubDate,
      link: article.link || '',
      leadMinutes: Math.round((detectedTime - publishedTime) / 60000),
    });
  }

  matches.sort((a, b) => toTime(b.pubDate) - toTime(a.pubDate));
  return {
    status: matches.length > 0
      ? 'related_information_found'
      : (sameDayUnknownTimeCount > 0 ? 'same_day_time_unverified' : 'unexplained_at_detection'),
    detectedAt,
    lookbackHours,
    relatedArticles: matches.slice(0, 3),
    sameDayUnknownTimeCount,
  };
}

function attachSignalEvidence(signals = [], articles = [], options = {}) {
  return signals.map(signal => ({
    ...signal,
    evidence: classifySignalEvidence(signal, articles, options),
  }));
}

function addFlowValues(left, right) {
  if (typeof left !== 'number' || typeof right !== 'number') return null;
  return left + right;
}

function marketFlowObservation(capitalFlow = {}, observedAt = new Date().toISOString()) {
  const flow = capitalFlow.investorFlow;
  if (!flow?.latest || !flow.date) return null;
  return {
    observedAt,
    date: flow.date,
    market: flow.market || 'KOSPI',
    source: flow.source || '',
    unit: flow.unit || '억원',
    latest: {
      foreign: flow.latest.foreign,
      institution: flow.latest.institution,
      combined: addFlowValues(flow.latest.foreign, flow.latest.institution),
    },
    sums5d: {
      foreign: flow.sums5d?.foreign ?? null,
      institution: flow.sums5d?.institution ?? null,
      combined: addFlowValues(flow.sums5d?.foreign, flow.sums5d?.institution),
    },
  };
}

function flowObservationKey(observation) {
  if (!observation) return '';
  return JSON.stringify([
    observation.date || '',
    observation.latest?.foreign ?? null,
    observation.latest?.institution ?? null,
    observation.latest?.combined ?? null,
    observation.sums5d?.foreign ?? null,
    observation.sums5d?.institution ?? null,
    observation.sums5d?.combined ?? null,
  ]);
}

function marketFlowContextKey(context = {}) {
  return JSON.stringify({
    status: context.status || '',
    atDetection: flowObservationKey(context.atDetection),
    firstAvailableAfterDetection: flowObservationKey(context.firstAvailableAfterDetection),
    lastObserved: flowObservationKey(context.lastObserved),
    alignmentAtDetection: context.alignmentAtDetection || '',
    alignmentAtLastObserved: context.alignmentAtLastObserved || '',
    sameMarketDateDelta: context.sameMarketDateDelta || null,
  });
}

function classifyMarketFlowAlignment(signal, observation) {
  const domestic = isDomesticTicker(signal.ticker || signal.symbol || '');
  if (!domestic) return 'market_context_only';
  const signalDate = signal.date || (signal.detectedAt ? getKSTDate(new Date(signal.detectedAt)) : '');
  if (!observation?.date || !signalDate) return 'neutral_or_unavailable';
  if (observation.date < signalDate) return 'prior_market_date_context';
  if (observation.date > signalDate) return 'later_market_date_context';
  const combined = observation?.latest?.combined;
  if (typeof combined !== 'number' || combined === 0 || signal.direction === 'unknown') return 'neutral_or_unavailable';
  const aligned = (signal.direction === 'up' && combined > 0)
    || (signal.direction === 'down' && combined < 0);
  return aligned ? 'market_aligned' : 'market_diverged';
}

function attachSignalMarketFlow(signal, capitalFlow = {}, observedAt = new Date().toISOString()) {
  const observation = marketFlowObservation(capitalFlow, observedAt);
  return {
    ...signal,
    marketFlowContext: observation ? {
      scope: 'kospi_market_context_not_stock_specific',
      status: 'detection_snapshot',
      atDetection: observation,
      lastObserved: observation,
      alignmentAtDetection: classifyMarketFlowAlignment(signal, observation),
      alignmentAtLastObserved: classifyMarketFlowAlignment(signal, observation),
      sameMarketDateDelta: null,
    } : {
      scope: 'kospi_market_context_not_stock_specific',
      status: 'unavailable_at_detection',
      atDetection: null,
      lastObserved: null,
      alignmentAtDetection: 'neutral_or_unavailable',
      alignmentAtLastObserved: 'neutral_or_unavailable',
      sameMarketDateDelta: null,
    },
  };
}

function updateSignalMarketFlow(signal, capitalFlow = {}, observedAt = new Date().toISOString()) {
  const observation = marketFlowObservation(capitalFlow, observedAt);
  if (!observation) return signal;
  const context = signal.marketFlowContext || {};
  const sameObservation = flowObservationKey(context.lastObserved) === flowObservationKey(observation);
  if (sameObservation) {
    const firstAvailableIsLatest = !context.atDetection
      && flowObservationKey(context.firstAvailableAfterDetection) === flowObservationKey(observation);
    const normalizedStatus = firstAvailableIsLatest ? 'first_available_after_detection' : context.status;
    const alignmentAtLastObserved = context.alignmentAtLastObserved
      || classifyMarketFlowAlignment(signal, observation);
    if (
      normalizedStatus === context.status
      && alignmentAtLastObserved === context.alignmentAtLastObserved
    ) return signal;
    return {
      ...signal,
      marketFlowContext: {
        ...context,
        status: normalizedStatus,
        alignmentAtLastObserved,
      },
    };
  }
  const atDetection = context.atDetection || null;
  const firstAvailableAfterDetection = context.firstAvailableAfterDetection || (!atDetection ? observation : null);
  const baseline = atDetection || firstAvailableAfterDetection;
  const sameDate = baseline?.date === observation.date;
  const delta = sameDate ? {
    foreign: addFlowValues(observation.latest.foreign, typeof baseline.latest?.foreign === 'number' ? -baseline.latest.foreign : null),
    institution: addFlowValues(observation.latest.institution, typeof baseline.latest?.institution === 'number' ? -baseline.latest.institution : null),
    combined: addFlowValues(observation.latest.combined, typeof baseline.latest?.combined === 'number' ? -baseline.latest.combined : null),
  } : null;
  return {
    ...signal,
    marketFlowContext: {
      scope: 'kospi_market_context_not_stock_specific',
      status: atDetection
        ? (sameDate ? 'same_market_date_follow_up' : 'later_market_date_follow_up')
        : (context.firstAvailableAfterDetection
            ? (sameDate ? 'same_market_date_follow_up_after_detection' : 'later_market_date_follow_up_after_detection')
            : 'first_available_after_detection'),
      atDetection,
      firstAvailableAfterDetection,
      lastObserved: observation,
      alignmentAtDetection: context.alignmentAtDetection || 'neutral_or_unavailable',
      alignmentAtLastObserved: classifyMarketFlowAlignment(signal, observation),
      sameMarketDateDelta: delta,
    },
  };
}

function evaluateSignalFollowUp(signal, articles = [], options = {}) {
  const detectedTime = toTime(signal.detectedAt || signal.evidence?.detectedAt);
  const checkedAt = options.checkedAt || new Date().toISOString();
  const checkedTime = toTime(checkedAt);
  if (!detectedTime || !checkedTime || options.dataAvailable !== true) return signal;
  const detectionEvidence = classifySignalEvidence(signal, articles, {
    detectedAt: signal.detectedAt || signal.evidence?.detectedAt,
    lookbackHours: signal.evidence?.lookbackHours || DEFAULT_EVIDENCE_LOOKBACK_HOURS,
    dataAvailable: true,
  });
  const matches = articles
    .filter(article => articleMatchesSignal(article, signal))
    .filter(article => (article.pubDatePrecision || 'datetime') !== 'date')
    .map(article => ({ article, publishedTime: toTime(article.pubDate) }))
    .filter(item => item.publishedTime > detectedTime && item.publishedTime <= checkedTime)
    .sort((a, b) => a.publishedTime - b.publishedTime);
  if (matches.length === 0) {
    return {
      ...signal,
      evidence: {
        ...detectionEvidence,
        checkedAt,
      },
    };
  }
  const first = matches[0].article;
  const followingArticle = {
    id: first.id || '',
    title: first.titleKo || first.title || '',
    source: first.source || '',
    pubDate: first.pubDate,
    link: first.link || '',
    lagMinutes: Math.round((toTime(first.pubDate) - detectedTime) / 60000),
  };
  return {
    ...signal,
    evidence: {
      ...detectionEvidence,
      status: 'related_information_after_signal',
      checkedAt,
      firstFollowingArticle: followingArticle,
      relatedArticles: [
        ...(signal.evidence?.relatedArticles || []),
        followingArticle,
      ].slice(0, 3),
    },
  };
}

function scorePreNewsSignal(item, marketProfile = {}) {
  const reasons = [];
  const warnings = [];
  let score = 0;
  const sources = new Set(item.sources || []);
  const isPersonallyRelevant = sources.has('holding') || sources.has('recent_recommendation');
  const changePercent = marketProfile.changePercent;

  if (typeof changePercent === 'number') {
    if (changePercent >= 10) {
      score += 5;
      reasons.push(`당일 급등 +${changePercent}%`);
    } else if (changePercent >= 5) {
      score += 3;
      reasons.push(`당일 강세 +${changePercent}%`);
    } else if (changePercent <= -10) {
      score += 5;
      reasons.push(`당일 급락 ${changePercent}%`);
      warnings.push('급락 원인과 보유 리스크 즉시 확인');
    } else if (changePercent <= -5) {
      warnings.push(`당일 급락 ${changePercent}%`);
    }
  }

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

  const extremeMove = typeof changePercent === 'number' && Math.abs(changePercent) >= 10;
  const strongPersonalSignal = isPersonallyRelevant && score >= 7;
  const chaseWarning = warnings.some(text => text.includes('추격 금지'));
  const action = (extremeMove || (strongPersonalSignal && !chaseWarning))
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
  articles = [],
  articleDataAvailable = false,
  evidenceLookbackHours = DEFAULT_EVIDENCE_LOOKBACK_HOURS,
  investorFlow = null,
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

  const capitalFlow = buildCapitalFlowSnapshot({ investorFlow });
  const verifiedSignals = attachSignalEvidence(signals, articles, {
    detectedAt: now.toISOString(),
    lookbackHours: evidenceLookbackHours,
    dataAvailable: articleDataAvailable,
  }).map(signal => {
    const change = signal.marketProfile?.changePercent;
    const direction = typeof change !== 'number' ? 'unknown' : (change < 0 ? 'down' : 'up');
    return attachSignalMarketFlow({
      ...signal,
      id: `${getKSTDate(now)}:${signal.symbol}:${direction}:${signal.action}`,
      date: getKSTDate(now),
      detectedAt: now.toISOString(),
      direction,
    }, capitalFlow, now.toISOString());
  });
  verifiedSignals.sort((a, b) => b.score - a.score);
  return {
    id: `${getKSTDate(now)}:pre-news-signal`,
    date: getKSTDate(now),
    createdAt: now.toISOString(),
    universeCount: universe.length,
    evidenceLookbackHours,
    articleDataAvailable,
    capitalFlow,
    signals: verifiedSignals,
    candidates: verifiedSignals.filter(item => item.action === 'pre_news_candidate'),
    watch: verifiedSignals.filter(item => item.action === 'watch'),
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
  normalizeEvidenceText,
  articleMatchesSignal,
  classifySignalEvidence,
  attachSignalEvidence,
  evaluateSignalFollowUp,
  marketFlowObservation,
  classifyMarketFlowAlignment,
  attachSignalMarketFlow,
  updateSignalMarketFlow,
  flowObservationKey,
  marketFlowContextKey,
};
