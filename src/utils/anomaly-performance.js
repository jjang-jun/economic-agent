const {
  fetchEvaluationQuotes,
  calculateReturn,
  getEvaluationStats,
  getResultLabel,
} = require('./recommendation-log');
const {
  loadMarketAnomalySignals,
  updateMarketAnomalySignals,
} = require('./persistence');
const { getKSTDate } = require('./article-archive');

const ANOMALY_EVALUATION_DAYS = [1, 5];
const DEFAULT_LOOKBACK_DAYS = 90;
const MIN_RESEARCH_SAMPLE_5D = 30;

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function daysAgoIso(days, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function signalDate(signal) {
  return signal.date || getKSTDate(new Date(signal.detectedAt));
}

function toEvaluationInput(signal) {
  const symbol = signal.symbol || signal.ticker;
  const price = signal.marketProfile?.price;
  if (
    !symbol
    || !(typeof price === 'number' && price > 0)
    || !signal.detectedAt
    || !['up', 'down'].includes(signal.direction)
  ) return null;
  return {
    id: signal.id,
    date: signalDate(signal),
    symbol,
    ticker: signal.ticker || symbol,
    signal: signal.direction === 'down' ? 'bearish' : 'bullish',
    entry: {
      price,
      marketTime: signal.marketProfile?.marketTime || signal.detectedAt,
    },
    evaluations: signal.evaluations || {},
  };
}

async function evaluateMarketAnomalySignals(options = {}) {
  const loadSignals = options.loadSignals || loadMarketAnomalySignals;
  const persistSignals = options.persistSignals || updateMarketAnomalySignals;
  const fetchQuotes = options.fetchQuotes || fetchEvaluationQuotes;
  const horizons = options.horizons || ANOMALY_EVALUATION_DAYS;
  const loaded = await loadSignals({
    since: options.since || daysAgoIso(options.lookbackDays || DEFAULT_LOOKBACK_DAYS, options.now),
    limit: options.limit || 1000,
  });
  if (loaded.error) throw new Error(`이상징후 조회 실패: ${loaded.error.message}`);
  if (!Array.isArray(loaded.rows)) {
    return { total: 0, changed: 0, completed: [], signals: [], disabled: loaded.disabled === true };
  }

  const signals = loaded.rows;
  const completed = [];
  const changed = [];
  for (const signal of signals) {
    const input = toEvaluationInput(signal);
    if (!input) continue;
    const due = horizons.filter(day => !signal.evaluations?.[String(day)]);
    if (due.length === 0) continue;
    const quotes = await fetchQuotes(input, due);
    let signalChanged = false;
    signal.evaluations = signal.evaluations || {};
    for (const day of due) {
      const quote = quotes.get(day);
      if (!quote || quote.evaluationPriceMode === 'current_fallback') continue;
      const returns = calculateReturn(input.signal, input.entry.price, quote.price);
      const evaluation = {
        day,
        evaluatedAt: new Date().toISOString(),
        price: quote.price,
        currency: quote.currency || signal.marketProfile?.currency || '',
        marketTime: quote.marketTime || '',
        source: quote.source || '',
        priceType: quote.priceType || '',
        priceMode: quote.evaluationPriceMode || 'official_eod',
        targetDate: quote.evaluationTargetDate || '',
        ...returns,
        ...getEvaluationStats(input, quote),
      };
      evaluation.resultLabel = getResultLabel(evaluation);
      signal.evaluations[String(day)] = evaluation;
      completed.push({ signal, day, evaluation });
      signalChanged = true;
    }
    if (signalChanged) changed.push(signal);
  }

  if (changed.length > 0) {
    const result = await persistSignals(changed);
    if (result.error) throw new Error(`이상징후 평가 저장 실패: ${result.error.message}`);
  }
  return { total: signals.length, changed: changed.length, completed, signals };
}

function average(items, getValue) {
  const values = items.map(getValue).filter(value => typeof value === 'number' && Number.isFinite(value));
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function summarizeHorizon(signals, day) {
  const evaluated = signals
    .map(signal => signal.evaluations?.[String(day)])
    .filter(item => typeof item?.signalReturnPct === 'number');
  const wins = evaluated.filter(item => item.signalReturnPct > 0).length;
  return {
    evaluated: evaluated.length,
    hitRatePct: evaluated.length ? round((wins / evaluated.length) * 100) : null,
    avgSignalReturnPct: average(evaluated, item => item.signalReturnPct),
    avgFavorableExcursionPct: average(evaluated, item => item.maxFavorableExcursionPct),
    avgAdverseExcursionPct: average(evaluated, item => item.maxAdverseExcursionPct),
  };
}

function hasReason(signal, pattern) {
  return (signal.reasons || []).some(reason => pattern.test(String(reason)));
}

function factorKeys(signal) {
  const profile = signal.marketProfile || {};
  const factors = ['price_move'];
  if ((profile.volumeRatio20d || 0) >= 1.5 || hasReason(signal, /거래량/)) factors.push('volume');
  if (profile.breakout20d || profile.near20dHigh || hasReason(signal, /20일.*고점|고점.*20일/)) factors.push('high_proximity');
  if (profile.ma5AboveMa20 || (profile.priceAboveMa5 && profile.priceAboveMa20) || hasReason(signal, /5일선|20일선/)) factors.push('ma_trend');
  if (typeof profile.relativeStrength20d === 'number' && profile.relativeStrength20d > 0) factors.push('relative_strength');
  const flow = signal.marketFlowContext;
  if (
    ['detection_snapshot', 'same_market_date_follow_up'].includes(flow?.status)
    && ['market_aligned'].includes(flow?.alignmentAtLastObserved || flow?.alignmentAtDetection)
  ) factors.push('market_flow_aligned');
  return factors;
}

function summarizeFactorCombinations(signals, day = 5) {
  const groups = new Map();
  for (const signal of signals) {
    const evaluation = signal.evaluations?.[String(day)];
    if (typeof evaluation?.signalReturnPct !== 'number') continue;
    const key = factorKeys(signal).join('+');
    const group = groups.get(key) || { key, evaluated: 0, wins: 0, returns: [] };
    group.evaluated += 1;
    if (evaluation.signalReturnPct > 0) group.wins += 1;
    group.returns.push(evaluation.signalReturnPct);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({
    key: group.key,
    evaluated: group.evaluated,
    hitRatePct: round((group.wins / group.evaluated) * 100),
    avgSignalReturnPct: average(group.returns, value => value),
  })).sort((a, b) => b.evaluated - a.evaluated || (b.avgSignalReturnPct || 0) - (a.avgSignalReturnPct || 0));
}

function buildAnomalyPerformanceSummary(signals = [], options = {}) {
  const dataAvailable = options.dataAvailable !== false;
  if (!dataAvailable) {
    return { dataAvailable: false, dataError: options.dataError || '', total: 0 };
  }
  const articleBefore = signals.filter(signal => signal.evidence?.status === 'related_information_found');
  const signalBeforeArticle = signals.filter(signal => signal.evidence?.status === 'related_information_after_signal');
  const leadRows = articleBefore.flatMap(signal => signal.evidence?.relatedArticles || []);
  const lagRows = signalBeforeArticle.map(signal => signal.evidence?.firstFollowingArticle).filter(Boolean);
  const nonPersistentWithoutFollowUp = signals.filter(signal => (
    typeof signal.evaluations?.['1']?.signalReturnPct === 'number'
    && signal.evaluations['1'].signalReturnPct <= 0
    && !signal.evidence?.firstFollowingArticle
    && signal.evidence?.status === 'unexplained_at_detection'
  ));
  const horizon5 = summarizeHorizon(signals, 5);
  return {
    dataAvailable: true,
    total: signals.length,
    strong: signals.filter(signal => signal.action === 'pre_news_candidate').length,
    watch: signals.filter(signal => signal.action !== 'pre_news_candidate').length,
    evidenceTiming: {
      articleBeforeSignal: articleBefore.length,
      avgLeadMinutes: average(leadRows, item => item.leadMinutes),
      signalBeforeArticle: signalBeforeArticle.length,
      avgLagMinutes: average(lagRows, item => item.lagMinutes),
      unexplainedAtDetection: signals.filter(signal => signal.evidence?.status === 'unexplained_at_detection').length,
      timeUnverified: signals.filter(signal => signal.evidence?.status === 'same_day_time_unverified').length,
      unavailable: signals.filter(signal => signal.evidence?.status === 'evidence_unavailable').length,
    },
    horizons: {
      1: summarizeHorizon(signals, 1),
      5: horizon5,
    },
    nonPersistentWithoutFollowUp: nonPersistentWithoutFollowUp.length,
    factorCombinations: summarizeFactorCombinations(signals, 5).slice(0, 5),
    readiness: {
      researchOnly: true,
      required5d: MIN_RESEARCH_SAMPLE_5D,
      evaluated5d: horizon5.evaluated,
      ready: horizon5.evaluated >= MIN_RESEARCH_SAMPLE_5D,
    },
  };
}

module.exports = {
  ANOMALY_EVALUATION_DAYS,
  DEFAULT_LOOKBACK_DAYS,
  MIN_RESEARCH_SAMPLE_5D,
  toEvaluationInput,
  evaluateMarketAnomalySignals,
  summarizeHorizon,
  factorKeys,
  summarizeFactorCombinations,
  buildAnomalyPerformanceSummary,
};
