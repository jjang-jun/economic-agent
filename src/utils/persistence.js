const { getKSTDate } = require('./article-archive');

const USE_DIRECT_DATABASE_REST = Boolean(process.env.DATABASE_REST_URL);
const DATABASE_REST_URL = process.env.DATABASE_REST_URL
  || process.env.SUPABASE_URL
  || process.env.SUPABASE_PROJECT_URL;
const DATABASE_REST_KEY = USE_DIRECT_DATABASE_REST
  ? process.env.DATABASE_REST_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY;

let supabaseCircuitOpenUntil = 0;
let supabaseCircuitReason = '';

function isPersistenceEnabled() {
  return Boolean(DATABASE_REST_URL && (USE_DIRECT_DATABASE_REST || DATABASE_REST_KEY));
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function getHeaders(prefer = 'resolution=merge-duplicates') {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (DATABASE_REST_KEY) {
    headers.apikey = DATABASE_REST_KEY;
    headers.Authorization = `Bearer ${DATABASE_REST_KEY}`;
  }
  if (prefer) headers.Prefer = prefer;
  return headers;
}

function getTableUrl(table) {
  if (USE_DIRECT_DATABASE_REST) {
    const base = new URL(DATABASE_REST_URL);
    const prefix = base.pathname.replace(/\/$/, '');
    base.pathname = `${prefix}/${table}`.replace(/\/+/g, '/');
    return base;
  }
  return new URL(`/rest/v1/${table}`, DATABASE_REST_URL);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCircuitBreakerMs() {
  return parseNonNegativeInt(
    process.env.DATABASE_REST_CIRCUIT_BREAKER_MS ?? process.env.SUPABASE_CIRCUIT_BREAKER_MS,
    60_000,
  );
}

function getRequestTimeoutMs() {
  return parseNonNegativeInt(
    process.env.DATABASE_REST_REQUEST_TIMEOUT_MS ?? process.env.SUPABASE_REQUEST_TIMEOUT_MS,
    10_000,
  );
}

function getRetryMaxDelayMs() {
  return parseNonNegativeInt(
    process.env.DATABASE_REST_RETRY_MAX_DELAY_MS ?? process.env.SUPABASE_RETRY_MAX_DELAY_MS,
    5_000,
  );
}

function getPersistenceCircuitError() {
  if (Date.now() >= supabaseCircuitOpenUntil) return null;
  const err = new Error(`Database persistence temporarily disabled: ${supabaseCircuitReason || 'recent transient failure'}`);
  err.status = 503;
  err.circuitOpen = true;
  return err;
}

function recordSupabaseFailure(err) {
  if (!shouldRetrySupabaseError(err)) return;
  const breakerMs = getCircuitBreakerMs();
  if (breakerMs <= 0) return;
  supabaseCircuitOpenUntil = Date.now() + breakerMs;
  supabaseCircuitReason = err?.message || String(err || 'unknown error');
  console.warn(`[DB] 원격 저장 ${Math.round(breakerMs / 1000)}초간 일시 중지: ${supabaseCircuitReason}`);
}

async function buildHttpError(res) {
  const body = await res.text();
  const contentType = res.headers?.get?.('content-type') || '';
  const err = new Error(summarizeHttpError(res.status, body, contentType));
  err.status = res.status;
  err.body = body;
  err.retryAfterMs = parseRetryAfterMs(res.headers?.get?.('retry-after'));
  return err;
}

function shouldRetrySupabaseError(err) {
  if (!err || typeof err.status !== 'number') return true;
  return err.status === 408 || err.status === 429 || err.status >= 500;
}

function parseRetryAfterMs(value, now = Date.now()) {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return 0;
  return Math.max(0, date - now);
}

function getRetryDelayMs(err, attempt, baseDelayMs) {
  const retryAfterMs = parseNonNegativeInt(err?.retryAfterMs, 0);
  const exponentialMs = baseDelayMs * (2 ** attempt);
  const jitteredMs = exponentialMs > 0
    ? Math.round(exponentialMs * (0.75 + (Math.random() * 0.5)))
    : 0;
  return Math.min(
    getRetryMaxDelayMs(),
    Math.max(retryAfterMs, jitteredMs),
  );
}

function withRequestTimeout(options = {}) {
  const timeoutMs = getRequestTimeoutMs();
  if (timeoutMs <= 0) return options;

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal,
  };
}

async function fetchDatabaseWithRetry(url, options = {}) {
  const retries = parseNonNegativeInt(
    process.env.DATABASE_REST_RETRY_COUNT ?? process.env.SUPABASE_RETRY_COUNT,
    1,
  );
  const baseDelayMs = parseNonNegativeInt(
    process.env.DATABASE_REST_RETRY_DELAY_MS ?? process.env.SUPABASE_RETRY_DELAY_MS,
    300,
  );
  const timeoutMs = getRequestTimeoutMs();
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, withRequestTimeout(options));
      if (res.ok) return res;

      const err = await buildHttpError(res);
      if (!shouldRetrySupabaseError(err) || attempt >= retries) throw err;
      lastError = err;
    } catch (err) {
      if (err?.name === 'TimeoutError') {
        const timeoutError = new Error(`Database REST request timed out after ${timeoutMs}ms`, { cause: err });
        timeoutError.name = 'TimeoutError';
        timeoutError.timeout = true;
        err = timeoutError;
      }
      if (!shouldRetrySupabaseError(err) || attempt >= retries) throw err;
      lastError = err;
    }

    const delay = getRetryDelayMs(lastError, attempt, baseDelayMs);
    console.warn(`[DB] 저장 API 일시 오류 재시도 ${attempt + 1}/${retries} (${delay}ms 후): ${lastError.message}`);
    if (delay > 0) await sleep(delay);
  }

  throw lastError;
}

function summarizeHttpError(status, body = '', contentType = '') {
  const raw = String(body || '').trim();
  if (!raw) return `${status}`;

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(raw);
      const message = parsed.message || parsed.error_description || parsed.error || parsed.hint || raw;
      return `${status} ${String(message).replace(/\s+/g, ' ').slice(0, 240)}`;
    } catch (_) {
      return `${status} ${raw.replace(/\s+/g, ' ').slice(0, 240)}`;
    }
  }

  const cloudflareMatch = raw.match(/Error code\s+(\d+)/i);
  if (cloudflareMatch) return `${status} Cloudflare ${cloudflareMatch[1]}`;

  const titleMatch = raw.match(/<title[^>]*>(.*?)<\/title>/is);
  if (titleMatch) {
    return `${status} ${titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 200)}`;
  }

  return `${status} ${raw.replace(/\s+/g, ' ').slice(0, 240)}`;
}

async function upsert(table, rows, onConflict, options = {}) {
  if (!isPersistenceEnabled() || !rows || rows.length === 0) return { saved: 0 };
  const circuitError = getPersistenceCircuitError();
  if (circuitError) return { saved: 0, error: circuitError, skipped: true };

  const url = getTableUrl(table);
  if (onConflict) url.searchParams.set('on_conflict', onConflict);

  try {
    const res = await fetchDatabaseWithRetry(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(rows),
    });
    return { saved: rows.length };
  } catch (err) {
    console.warn(`[DB] ${table} 저장 실패: ${err.message}`);
    if (options.openCircuit !== false) recordSupabaseFailure(err);
    return { saved: 0, error: err };
  }
}

async function insertRowsIgnoreDuplicates(table, rows, onConflict) {
  if (!isPersistenceEnabled() || !rows || rows.length === 0) return { saved: 0 };
  const circuitError = getPersistenceCircuitError();
  if (circuitError) return { saved: 0, error: circuitError, skipped: true };
  const url = getTableUrl(table);
  if (onConflict) url.searchParams.set('on_conflict', onConflict);
  try {
    await fetchDatabaseWithRetry(url, {
      method: 'POST',
      headers: getHeaders('resolution=ignore-duplicates'),
      body: JSON.stringify(rows),
    });
    return { saved: rows.length };
  } catch (err) {
    console.warn(`[DB] ${table} 저장 실패: ${err.message}`);
    recordSupabaseFailure(err);
    return { saved: 0, error: err };
  }
}

async function deleteRows(table, filterParams = {}) {
  if (!isPersistenceEnabled()) return { deleted: 0, disabled: true };
  const circuitError = getPersistenceCircuitError();
  if (circuitError) return { deleted: 0, error: circuitError, skipped: true };
  const url = getTableUrl(table);
  for (const [key, value] of Object.entries(filterParams || {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  try {
    await fetchDatabaseWithRetry(url, {
      method: 'DELETE',
      headers: getHeaders('return=minimal'),
    });
    return { deleted: 1 };
  } catch (err) {
    console.warn(`[DB] ${table} 삭제 실패: ${err.message}`);
    recordSupabaseFailure(err);
    return { deleted: 0, error: err };
  }
}

async function patchRows(table, filterParams, payload) {
  if (!isPersistenceEnabled()) return { saved: 0, disabled: true };
  const circuitError = getPersistenceCircuitError();
  if (circuitError) return { saved: 0, error: circuitError, skipped: true };
  const url = getTableUrl(table);
  for (const [key, value] of Object.entries(filterParams || {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  try {
    await fetchDatabaseWithRetry(url, {
      method: 'PATCH',
      headers: getHeaders('return=minimal'),
      body: JSON.stringify(payload),
    });
    return { saved: 1 };
  } catch (err) {
    console.warn(`[DB] ${table} 갱신 실패: ${err.message}`);
    recordSupabaseFailure(err);
    return { saved: 0, error: err };
  }
}

async function selectRows(table, params = {}) {
  if (!isPersistenceEnabled()) return { rows: null, disabled: true };
  const circuitError = getPersistenceCircuitError();
  if (circuitError) return { rows: null, error: circuitError, skipped: true };

  const url = getTableUrl(table);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  try {
    const res = await fetchDatabaseWithRetry(url, {
      headers: getHeaders(''),
    });
    return { rows: await res.json() };
  } catch (err) {
    console.warn(`[DB] ${table} 조회 실패: ${err.message}`);
    recordSupabaseFailure(err);
    return { rows: null, error: err };
  }
}

function postgrestIn(values = []) {
  const unique = [...new Set(values.filter(Boolean).map(String))];
  const escaped = unique.map(value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `in.(${escaped.join(',')})`;
}

function articleRow(article, date = getKSTDate()) {
  return {
    id: article.id,
    date,
    title: article.title || '',
    title_ko: article.titleKo || '',
    summary: article.summary || '',
    link: article.link || '',
    pub_date: article.pubDate || null,
    source: article.source || '',
    score: article.score || null,
    sentiment: article.sentiment || 'neutral',
    finbert_confidence: article.finbertConfidence || null,
    sectors: article.sectors || [],
    reason: article.reason || '',
    high_priority: Boolean(article.highPriority),
    payload: article,
    updated_at: new Date().toISOString(),
  };
}

async function persistArticles(articles, date = getKSTDate()) {
  const rows = (articles || [])
    .filter(article => article && article.id)
    .map(article => articleRow(article, date));
  return upsert('articles', rows, 'id');
}

async function loadPersistedArticleIds(articleIds = []) {
  const ids = [...new Set((articleIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return new Set();

  const found = new Set();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const result = await selectRows('articles', {
      select: 'id',
      id: postgrestIn(batch),
    });
    for (const row of result.rows || []) {
      if (row.id) found.add(row.id);
    }
  }
  return found;
}

async function loadPersistedArticles(options = {}) {
  const params = {
    select: 'id,payload,date,score,pub_date,updated_at',
    order: options.order || 'score.desc,pub_date.desc,updated_at.desc',
    limit: String(options.limit || 200),
  };
  if (options.date) params.date = `eq.${options.date}`;
  if (typeof options.minScore === 'number') params.score = `gte.${options.minScore}`;
  if (options.since) params.pub_date = `gte.${options.since}`;

  const result = await selectRows('articles', params);
  if (!result.rows) return result;

  return {
    rows: result.rows
      .map(row => row.payload || {
        id: row.id,
        pubDate: row.pub_date,
        score: row.score,
      })
      .filter(Boolean),
  };
}

async function persistDailySummary(summary) {
  if (!summary?.date) return { saved: 0 };
  return upsert('daily_summaries', [{
    date: summary.date,
    stats: summary.stats || {},
    indicators: summary.indicators || {},
    top_news: summary.topNews || [],
    stock_report: summary.stockReport || null,
    payload: summary,
    updated_at: new Date().toISOString(),
  }], 'date');
}

async function loadPersistedDailySummaries(options = {}) {
  const params = {
    // AI continuity only needs this compact projection. Reading payload would
    // rehydrate archived indicators/digests and can recursively amplify context.
    select: 'date,stats,top_news,stock_report_market_summary:stock_report->>market_summary,updated_at',
    order: options.order || 'date.desc,updated_at.desc',
    limit: String(options.limit || 5),
  };
  if (options.date) params.date = `eq.${options.date}`;

  const result = await selectRows('daily_summaries', params);
  if (!result.rows) return result;

  return {
    rows: result.rows
      .map(row => ({
        date: row.date,
        stats: row.stats || {},
        topNews: row.top_news || [],
        stockReport: row.stock_report_market_summary
          ? { market_summary: row.stock_report_market_summary }
          : null,
        updatedAt: row.updated_at || '',
      }))
      .filter(Boolean),
  };
}

async function persistStockReport(report, date = getKSTDate()) {
  if (!report) return { saved: 0 };
  return upsert('stock_reports', [{
    id: `${date}:stock-report`,
    date,
    market_summary: report.market_summary || '',
    report,
    decision: report.decision || null,
    created_at: new Date().toISOString(),
  }], 'id');
}

async function loadPersistedStockReports(options = {}) {
  const params = {
    select: 'date,market_summary,decision,report,created_at',
    order: options.order || 'date.desc,created_at.desc',
    limit: String(options.limit || 5),
  };
  if (options.date) params.date = `eq.${options.date}`;
  else if (options.startDate) params.date = `gte.${options.startDate}`;

  const result = await selectRows('stock_reports', params);
  if (!result.rows) return result;

  return {
    rows: result.rows
      .map(row => row.report ? { ...row.report, date: row.report.date || row.date } : {
        date: row.date,
        market_summary: row.market_summary || '',
        decision: row.decision || null,
      })
      .filter(Boolean),
  };
}

function recommendationRow(recommendation) {
  const aiMetadata = recommendation.aiMetadata || recommendation.ai_metadata || null;
  return {
    id: recommendation.id,
    date: recommendation.date,
    name: recommendation.name || '',
    ticker: recommendation.ticker || '',
    symbol: recommendation.symbol || '',
    signal: recommendation.signal || 'neutral',
    conviction: recommendation.conviction || 'low',
    thesis: recommendation.thesis || '',
    target_horizon: recommendation.targetHorizon || recommendation.target_horizon || '',
    reason: recommendation.reason || '',
    risk: recommendation.risk || '',
    invalidation: recommendation.invalidation || '',
    failure_reason: recommendation.failureReason || recommendation.failure_reason || '',
    risk_profile: recommendation.riskProfile || recommendation.risk_profile || null,
    market_profile: recommendation.marketProfile || recommendation.market_profile || null,
    risk_review: recommendation.riskReview || recommendation.risk_review || null,
    ai_provider: aiMetadata?.provider || null,
    ai_model: aiMetadata?.model || null,
    prompt_version: aiMetadata?.promptVersion || aiMetadata?.prompt_version || null,
    ai_metadata: aiMetadata,
    entry: recommendation.entry || null,
    benchmark: recommendation.benchmark || null,
    status: recommendation.status || '',
    payload: recommendation,
    updated_at: new Date().toISOString(),
  };
}

async function persistRecommendations(recommendations) {
  const rows = (recommendations || [])
    .filter(recommendation => recommendation && recommendation.id)
    .map(recommendationRow);
  return upsert('recommendations', rows, 'id');
}

async function loadPersistedRecommendations() {
  const result = await selectRows('recommendations', {
    select: 'payload',
    order: 'date.desc,updated_at.desc',
  });
  if (!result.rows) return result;

  const recommendations = result.rows
    .map(row => row.payload)
    .filter(Boolean);
  return { rows: recommendations };
}

function evaluationRow(item) {
  const recommendation = item.recommendation;
  const evaluation = item.evaluation;
  return {
    id: `${recommendation.id}:${item.day}`,
    recommendation_id: recommendation.id,
    day: item.day,
    evaluated_at: evaluation.evaluatedAt || null,
    price: evaluation.price || null,
    return_pct: evaluation.returnPct ?? null,
    signal_return_pct: evaluation.signalReturnPct ?? null,
    alpha_pct: evaluation.alphaPct ?? null,
    max_price_after: evaluation.maxPriceAfter ?? null,
    min_price_after: evaluation.minPriceAfter ?? null,
    max_favorable_excursion_pct: evaluation.maxFavorableExcursionPct ?? null,
    max_adverse_excursion_pct: evaluation.maxAdverseExcursionPct ?? null,
    max_drawdown_pct: evaluation.maxDrawdownPct ?? null,
    stop_touched: evaluation.stopTouched ?? null,
    target_touched: evaluation.targetTouched ?? null,
    result_label: evaluation.resultLabel || '',
    benchmark: evaluation.benchmark || null,
    payload: evaluation,
  };
}

async function persistRecommendationEvaluations(completed) {
  const rows = (completed || [])
    .filter(item => item?.recommendation?.id && item?.evaluation)
    .map(evaluationRow);
  return upsert('recommendation_evaluations', rows, 'id');
}

function researchCandidateRow(candidate) {
  const aiMetadata = candidate.aiMetadata || candidate.ai_metadata || null;
  return {
    id: candidate.id,
    date: candidate.date,
    name: candidate.name || '',
    ticker: candidate.ticker || '',
    symbol: candidate.symbol || '',
    signal: candidate.signal || 'neutral',
    conviction: candidate.conviction || 'low',
    cohort: candidate.trackingCohort || 'shadow',
    decision_status: candidate.decisionStatus || 'rejected',
    rejection_reasons: candidate.rejectionReasons || [],
    market_regime: candidate.marketRegime || '',
    ai_provider: aiMetadata?.provider || null,
    ai_model: aiMetadata?.model || null,
    prompt_version: aiMetadata?.promptVersion || aiMetadata?.prompt_version || null,
    entry: candidate.entry || null,
    benchmark: candidate.benchmark || null,
    status: candidate.status || '',
    payload: candidate,
    updated_at: new Date().toISOString(),
  };
}

async function persistResearchCandidates(candidates) {
  const rows = (candidates || [])
    .filter(candidate => candidate?.id && candidate?.date)
    .map(researchCandidateRow);
  return upsert('research_candidates', rows, 'id');
}

async function loadPersistedResearchCandidates() {
  const result = await selectRows('research_candidates', {
    select: 'payload',
    order: 'date.desc,updated_at.desc',
  });
  if (!result.rows) return result;
  return {
    rows: result.rows.map(row => row.payload).filter(Boolean),
  };
}

function researchEvaluationRow(item) {
  const candidate = item.recommendation;
  const evaluation = item.evaluation;
  return {
    id: `${candidate.id}:${item.day}`,
    candidate_id: candidate.id,
    day: item.day,
    evaluated_at: evaluation.evaluatedAt || null,
    price: evaluation.price || null,
    return_pct: evaluation.returnPct ?? null,
    signal_return_pct: evaluation.signalReturnPct ?? null,
    alpha_pct: evaluation.alphaPct ?? null,
    max_price_after: evaluation.maxPriceAfter ?? null,
    min_price_after: evaluation.minPriceAfter ?? null,
    max_favorable_excursion_pct: evaluation.maxFavorableExcursionPct ?? null,
    max_adverse_excursion_pct: evaluation.maxAdverseExcursionPct ?? null,
    max_drawdown_pct: evaluation.maxDrawdownPct ?? null,
    stop_touched: evaluation.stopTouched ?? null,
    target_touched: evaluation.targetTouched ?? null,
    result_label: evaluation.resultLabel || '',
    benchmark: evaluation.benchmark || null,
    payload: evaluation,
  };
}

async function persistResearchCandidateEvaluations(completed) {
  const rows = (completed || [])
    .filter(item => item?.recommendation?.id && item?.evaluation)
    .map(researchEvaluationRow);
  return upsert('research_candidate_evaluations', rows, 'id');
}

async function persistMarketAnomalySignals(signals = []) {
  const rows = (signals || []).filter(signal => signal?.id && signal?.detectedAt).map(signal => ({
    id: signal.id,
    date: signal.date || getKSTDate(new Date(signal.detectedAt)),
    symbol: signal.symbol || '',
    ticker: signal.ticker || '',
    name: signal.name || '',
    direction: signal.direction || 'unknown',
    score: signal.score ?? null,
    detected_at: signal.detectedAt,
    evidence_status: signal.evidence?.status || 'unverified',
    related_article_ids: (signal.evidence?.relatedArticles || []).map(article => article.id).filter(Boolean),
    payload: signal,
    updated_at: new Date().toISOString(),
  }));
  return insertRowsIgnoreDuplicates('market_anomaly_signals', rows, 'id');
}

async function loadMarketAnomalySignals(options = {}) {
  const result = await selectRows('market_anomaly_signals', {
    select: 'payload,detected_at,evidence_status',
    detected_at: options.since ? `gte.${options.since}` : undefined,
    evidence_status: options.evidenceStatuses ? postgrestIn(options.evidenceStatuses) : undefined,
    order: 'detected_at.asc',
    limit: String(options.limit || 200),
  });
  if (!result.rows) return result;
  return {
    rows: result.rows.map(row => ({
      ...(row.payload || {}),
      detectedAt: row.payload?.detectedAt || row.detected_at,
    })).filter(row => row.id),
  };
}

async function updateMarketAnomalySignals(signals = []) {
  const rows = (signals || []).filter(signal => signal?.id && signal?.detectedAt).map(signal => ({
    id: signal.id,
    date: signal.date || getKSTDate(new Date(signal.detectedAt)),
    symbol: signal.symbol || '',
    ticker: signal.ticker || '',
    name: signal.name || '',
    direction: signal.direction || 'unknown',
    score: signal.score ?? null,
    detected_at: signal.detectedAt,
    evidence_status: signal.evidence?.status || 'unverified',
    related_article_ids: (signal.evidence?.relatedArticles || []).map(article => article.id).filter(Boolean),
    payload: signal,
    updated_at: new Date().toISOString(),
  }));
  return upsert('market_anomaly_signals', rows, 'id');
}

function tradeExecutionRow(trade) {
  const amount = typeof trade.amount === 'number'
    ? trade.amount
    : (typeof trade.quantity === 'number' && typeof trade.price === 'number'
        ? trade.quantity * trade.price
        : null);
  return {
    id: trade.id,
    date: trade.date,
    executed_at: trade.executedAt || trade.executed_at || new Date().toISOString(),
    side: trade.side,
    ticker: trade.ticker || '',
    symbol: trade.symbol || '',
    name: trade.name || '',
    quantity: trade.quantity ?? null,
    price: trade.price ?? null,
    amount,
    fees: trade.fees ?? null,
    taxes: trade.taxes ?? null,
    recommendation_id: trade.recommendationId || trade.recommendation_id || null,
    notes: trade.notes || '',
    payload: trade,
    updated_at: new Date().toISOString(),
  };
}

async function persistTradeExecutions(trades) {
  const rows = (trades || [])
    .filter(trade => trade?.id && trade?.date && trade?.side)
    .map(tradeExecutionRow);
  return upsert('trade_executions', rows, 'id');
}

async function loadPersistedTradeExecutions() {
  const result = await selectRows('trade_executions', {
    select: 'payload',
    order: 'date.desc,executed_at.desc',
  });
  if (!result.rows) return result;

  const trades = result.rows
    .map(row => row.payload)
    .filter(Boolean);
  return { rows: trades };
}

function portfolioCashFlowRow(flow) {
  return {
    id: flow.id,
    date: flow.date,
    occurred_at: flow.occurredAt || flow.occurred_at,
    account_id: flow.accountId || flow.account_id || 'default:main',
    type: flow.type,
    amount: flow.amount,
    external_amount: flow.externalAmount ?? flow.external_amount ?? 0,
    is_external: flow.external === true,
    currency: flow.currency || 'KRW',
    notes: flow.notes || '',
    payload: flow,
    updated_at: new Date().toISOString(),
  };
}

async function persistPortfolioCashFlows(flows) {
  const rows = (flows || [])
    .filter(flow => flow?.id && flow?.date && flow?.occurredAt && flow?.type)
    .map(portfolioCashFlowRow);
  return upsert('portfolio_cash_flows', rows, 'id');
}

async function loadPersistedPortfolioCashFlows() {
  const result = await selectRows('portfolio_cash_flows', {
    select: 'payload',
    order: 'occurred_at.asc',
  });
  if (!result.rows) return result;
  return { rows: result.rows.map(row => row.payload).filter(Boolean) };
}

async function persistPortfolioSnapshot(snapshot) {
  if (!snapshot?.capturedAt) return { saved: 0 };
  const date = new Date(snapshot.capturedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  return upsert('portfolio_snapshots', [{
    id: `${date}:portfolio`,
    date,
    captured_at: snapshot.capturedAt,
    total_asset_value: snapshot.totalAssetValue ?? null,
    cash_amount: snapshot.cashAmount ?? null,
    invested_amount: snapshot.investedAmount ?? null,
    cost_basis: snapshot.costBasis ?? null,
    unrealized_pnl: snapshot.unrealizedPnl ?? null,
    unrealized_pnl_pct: snapshot.unrealizedPnlPct ?? null,
    payload: snapshot,
    updated_at: new Date().toISOString(),
  }], 'id');
}

async function loadLatestPersistedPortfolioSnapshot() {
  const result = await selectRows('portfolio_snapshots', {
    select: 'payload',
    order: 'captured_at.desc',
    limit: '1',
  });
  if (!result.rows) return result;
  return {
    rows: result.rows.map(row => row.payload).filter(Boolean),
  };
}

async function persistMarketSnapshots(snapshots, session = '', capturedAt = new Date().toISOString()) {
  const rows = (snapshots || [])
    .filter(item => item && item.symbol)
    .map(item => ({
      id: `${capturedAt}:${session}:${item.symbol}`,
      captured_at: capturedAt,
      session,
      name: item.name || '',
      symbol: item.symbol,
      price: item.price || null,
      previous_close: item.previousClose || null,
      change_percent: item.changePercent ?? null,
      return_5d_pct: item.return5dPct ?? null,
      return_20d_pct: item.return20dPct ?? null,
      currency: item.currency || '',
      market_time: item.marketTime || null,
      payload: item,
    }));
  return upsert('market_snapshots', rows, 'id');
}

async function persistPriceSnapshots(snapshots) {
  const rows = (snapshots || [])
    .filter(item => item && item.ticker && typeof item.price === 'number' && item.source && item.asOf)
    .map(item => ({
      ticker: item.ticker,
      symbol: item.symbol || '',
      name: item.name || '',
      market: item.market || '',
      price: item.price,
      open: item.open ?? null,
      high: item.high ?? null,
      low: item.low ?? null,
      close: item.close ?? item.price,
      volume: item.volume ?? null,
      trading_value: item.tradingValue ?? null,
      currency: item.currency || '',
      source: item.source,
      price_type: item.priceType || 'current',
      is_realtime: item.isRealtime ?? false,
      is_adjusted: item.isAdjusted ?? false,
      as_of: item.asOf,
      payload: item.payload || item,
    }));
  return upsert('price_snapshots', rows, 'ticker,source,price_type,as_of');
}

async function persistPriceProviderAttempt(attempt) {
  if (!attempt?.provider || !attempt?.ticker || !attempt?.priceType || !attempt?.status) {
    return { saved: 0 };
  }
  const attemptedAt = attempt.attemptedAt || new Date().toISOString();
  const id = attempt.id || [
    'price-attempt',
    attempt.provider,
    attempt.ticker,
    attempt.priceType,
    attemptedAt,
    Math.random().toString(36).slice(2, 8),
  ].join(':');
  return upsert('price_provider_attempts', [{
    id,
    provider: attempt.provider,
    ticker: attempt.ticker,
    price_type: attempt.priceType,
    status: attempt.status,
    attempted_at: attemptedAt,
    latency_ms: attempt.latencyMs ?? null,
    error_message: attempt.errorMessage || null,
    payload: attempt.payload || {},
  }], 'id', {
    // Provider 시도 이력은 관측용 부가 데이터다. 이 저장 실패가 종목 리포트,
    // 추천 로그 같은 핵심 산출물의 공유 회로차단기를 열어서는 안 된다.
    openCircuit: false,
  });
}

async function persistInvestorFlow(flow) {
  if (!flow?.latest?.date) return { saved: 0 };
  const latest = flow.latest;
  return upsert('investor_flows', [{
    id: `${flow.market || 'KOSPI'}:${latest.date}`,
    date: latest.date,
    market: flow.market || 'KOSPI',
    individual: latest.individual ?? null,
    foreign_net_buy: latest.foreign ?? null,
    institution_net_buy: latest.institution ?? null,
    pension_net_buy: latest.pension ?? null,
    unit: flow.unit || '억원',
    payload: flow,
    updated_at: new Date().toISOString(),
  }], 'id');
}

async function persistDecisionContext(context, date = getKSTDate()) {
  if (!context?.market) return { saved: 0 };
  return upsert('decision_contexts', [{
    id: `${date}:decision`,
    date,
    regime: context.market.regime || '',
    score: context.market.score || 0,
    context,
    created_at: new Date().toISOString(),
  }], 'id');
}

async function persistPerformanceReview(review) {
  if (!review?.id) return { saved: 0 };
  return upsert('performance_reviews', [{
    id: review.id,
    period: review.period || '',
    start_date: review.startDate || null,
    end_date: review.endDate || null,
    recommendation_summary: review.recommendationSummary || {},
    trade_summary: review.tradeSummary || {},
    notes: review.notes || [],
    payload: review,
    created_at: new Date().toISOString(),
  }], 'id');
}

async function persistFinancialFreedomGoal(status) {
  if (!status?.id || !status?.goal) return { saved: 0 };
  const goal = status.goal;
  return upsert('financial_freedom_goals', [{
    id: status.id,
    user_key: 'default',
    date: status.date || getKSTDate(),
    monthly_living_cost: goal.monthlyLivingCost ?? null,
    annual_living_cost: goal.annualLivingCost ?? null,
    target_withdrawal_rate: goal.targetWithdrawalRate ?? null,
    target_net_worth: goal.targetNetWorth ?? null,
    current_net_worth: status.currentNetWorth ?? null,
    monthly_saving_amount: status.monthlySavingAmount ?? null,
    target_progress_pct: status.targetProgressPct ?? null,
    target_date: status.targetDate || null,
    estimated_target_date: status.estimatedTargetDate || null,
    expected_annual_return_pct: status.expectedAnnualReturnPct ?? null,
    required_annual_return_pct: status.requiredAnnualReturnPct ?? null,
    stress: status.stress || {},
    payload: status,
    updated_at: new Date().toISOString(),
  }], 'id');
}

async function persistConversationMessage(message) {
  if (!message?.id) return { saved: 0 };
  return upsert('conversation_messages', [{
    id: message.id,
    chat_id: message.chatId || '',
    message_id: message.messageId || '',
    direction: message.direction || 'inbound',
    intent: message.intent || '',
    text: message.text || '',
    response: message.response || '',
    tools: message.tools || [],
    data_cutoff: message.dataCutoff || {},
    pending_action_id: message.pendingActionId || null,
    status: message.status || 'recorded',
    payload: message.payload || {},
    created_at: new Date().toISOString(),
  }], 'id');
}

async function persistPendingAction(action) {
  if (!action?.id || !action?.type) return { saved: 0 };
  return upsert('pending_actions', [{
    id: action.id,
    chat_id: action.chatId || '',
    type: action.type,
    status: action.status || 'pending',
    requested_payload: action.requestedPayload || {},
    risk_review: action.riskReview || {},
    confirmation_token: action.confirmationToken || '',
    expires_at: action.expiresAt || null,
    confirmed_at: action.confirmedAt || null,
    cancelled_at: action.cancelledAt || null,
    payload: action.payload || {},
    updated_at: new Date().toISOString(),
  }], 'id');
}

async function loadPendingAction(id) {
  if (!id) return null;
  const result = await selectRows('pending_actions', {
    select: '*',
    id: `eq.${id}`,
    limit: '1',
  });
  return result.rows?.[0] || null;
}

async function loadPendingActionsForChat(chatId, options = {}) {
  if (!chatId) return [];
  const result = await selectRows('pending_actions', {
    select: '*',
    chat_id: `eq.${String(chatId)}`,
    status: `eq.${options.status || 'pending'}`,
    order: 'created_at.desc',
    limit: String(options.limit || 5),
  });
  return result.rows || [];
}

function makeId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}:${globalThis.crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

async function createCollectorRun(run) {
  const id = run.id || makeId('collector-run');
  const row = {
    id,
    job_name: run.jobName,
    trigger_source: run.triggerSource || 'manual',
    scheduled_at: run.scheduledAt || null,
    started_at: run.startedAt || new Date().toISOString(),
    status: 'running',
    lookback_minutes: run.lookbackMinutes ?? null,
  };
  await upsert('collector_runs', [row], 'id');
  return { id, ...run };
}

async function updateCollectorRun(id, update) {
  if (!id) return { saved: 0 };
  return patchRows('collector_runs', { id: `eq.${id}` }, {
    finished_at: update.finishedAt || null,
    status: update.status || 'running',
    lookback_minutes: update.lookbackMinutes ?? null,
    rss_fetched_count: update.rssFetchedCount ?? null,
    dart_fetched_count: update.dartFetchedCount ?? null,
    new_article_count: update.newArticleCount ?? null,
    immediate_alert_count: update.immediateAlertCount ?? null,
    digest_buffer_count: update.digestBufferCount ?? null,
    error_message: update.errorMessage || null,
  });
}

async function getLastSuccessfulCollectorRun(jobName) {
  const result = await selectRows('collector_runs', {
    select: 'finished_at',
    job_name: `eq.${jobName}`,
    status: 'eq.success',
    order: 'finished_at.desc',
    limit: '1',
  });
  return result.rows?.[0]?.finished_at || null;
}

async function upsertSourceCursor(sourceName, cursor = {}) {
  if (!sourceName) return { saved: 0 };
  return upsert('source_cursors', [{
    source_name: sourceName,
    last_success_at: cursor.lastSuccessAt || null,
    last_seen_published_at: cursor.lastSeenPublishedAt || null,
    last_seen_external_id: cursor.lastSeenExternalId || null,
    updated_at: cursor.updatedAt || new Date().toISOString(),
  }], 'source_name');
}

async function tryAcquireJobLock(jobName, options = {}) {
  if (!isPersistenceEnabled()) return { acquired: true, disabled: true };
  const now = new Date();
  const result = await selectRows('job_locks', {
    select: '*',
    job_name: `eq.${jobName}`,
    limit: '1',
  });
  if (result.error) throw result.error;
  const existing = result.rows?.[0];
  if (existing?.locked_until && new Date(existing.locked_until) > now) {
    return { acquired: false, lockedUntil: existing.locked_until };
  }

  const lockedUntil = new Date(now.getTime() + (options.ttlSeconds || 600) * 1000).toISOString();
  const saved = await upsert('job_locks', [{
    job_name: jobName,
    locked_until: lockedUntil,
    locked_by: options.lockedBy || '',
    updated_at: now.toISOString(),
  }], 'job_name');
  if (saved.error) throw saved.error;
  return { acquired: true, lockedUntil };
}

async function releaseJobLock(jobName) {
  if (!isPersistenceEnabled()) return { saved: 0, disabled: true };
  return upsert('job_locks', [{
    job_name: jobName,
    locked_until: new Date(0).toISOString(),
    locked_by: '',
    updated_at: new Date().toISOString(),
  }], 'job_name');
}

async function loadWorkerJobRun(id) {
  if (!id) return { rows: [] };
  return selectRows('worker_job_runs', {
    select: '*',
    id: `eq.${String(id)}`,
    limit: '1',
  });
}

async function persistWorkerJobRun(run = {}) {
  if (!run.id || !run.jobName || !run.scheduledFor) {
    throw new Error('worker job run requires id, jobName, and scheduledFor');
  }
  const now = new Date().toISOString();
  return upsert('worker_job_runs', [{
    id: String(run.id),
    worker_id: String(run.workerId || ''),
    job_name: String(run.jobName),
    scheduled_for: run.scheduledFor,
    mode: String(run.mode || 'shadow'),
    status: String(run.status || 'scheduled'),
    attempt: Number(run.attempt || 0),
    started_at: run.startedAt || null,
    finished_at: run.finishedAt || null,
    exit_code: Number.isInteger(run.exitCode) ? run.exitCode : null,
    error_message: run.errorMessage || null,
    payload: run.payload || {},
    updated_at: now,
  }], 'id');
}

async function persistWorkerHeartbeat(heartbeat = {}) {
  if (!heartbeat.workerId) throw new Error('worker heartbeat requires workerId');
  const now = new Date().toISOString();
  return upsert('worker_heartbeats', [{
    worker_id: String(heartbeat.workerId),
    hostname: String(heartbeat.hostname || ''),
    platform: String(heartbeat.platform || process.platform),
    mode: String(heartbeat.mode || 'shadow'),
    version: heartbeat.version || null,
    started_at: heartbeat.startedAt || now,
    last_seen_at: heartbeat.lastSeenAt || now,
    gateway_connected: heartbeat.gatewayConnected === true,
    running_jobs: Number(heartbeat.runningJobs || 0),
    queued_jobs: Number(heartbeat.queuedJobs || 0),
    payload: heartbeat.payload || {},
    updated_at: now,
  }], 'worker_id');
}

async function persistAlertEvents(events) {
  const rows = (events || [])
    .filter(event => event?.articleId && event?.alertType)
    .map(event => ({
      id: event.id || `${event.articleId}:${event.alertType}`,
      article_id: event.articleId,
      alert_type: event.alertType,
      sent_at: event.sentAt || null,
      status: event.status || 'pending',
      payload: event.payload || {},
    }));
  return upsert('alert_events', rows, 'article_id,alert_type');
}

async function loadBufferedDigestArticles(options = {}) {
  const result = await selectRows('alert_events', {
    select: 'id,article_id,alert_type,status,payload,created_at',
    alert_type: postgrestIn(options.alertTypes || ['digest', 'catch_up']),
    status: postgrestIn(options.statuses || ['buffered', 'pending']),
    order: options.order || 'created_at.asc',
    limit: String(options.limit || 100),
  });
  if (!result.rows) return result;

  return {
    rows: result.rows
      .map(row => {
        const article = { ...(row.payload || {}) };
        if (!article.id && row.article_id) article.id = row.article_id;
        return {
          ...article,
          alertEventId: row.id,
          alertType: row.alert_type,
          alertStatus: row.status,
        };
      })
      .filter(article => article.id),
  };
}

async function loadAlertEventsForArticles(articleIds = []) {
  const ids = [...new Set((articleIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return [];

  const rows = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const result = await selectRows('alert_events', {
      select: 'article_id,alert_type,status,sent_at',
      article_id: postgrestIn(batch),
    });
    if (result.rows) rows.push(...result.rows);
  }
  return rows;
}

async function loadRecentImmediateAlertEvents(options = {}) {
  return selectRows('alert_events', {
    select: 'article_id,alert_type,status,sent_at,payload,created_at',
    alert_type: 'eq.immediate',
    status: 'eq.sent',
    sent_at: options.since ? `gte.${options.since}` : undefined,
    order: 'sent_at.desc',
    limit: String(options.limit || 100),
  });
}

module.exports = {
  isPersistenceEnabled,
  selectRows,
  upsertRows: upsert,
  deleteRows,
  persistArticles,
  loadPersistedArticleIds,
  loadPersistedArticles,
  persistDailySummary,
  loadPersistedDailySummaries,
  persistStockReport,
  loadPersistedStockReports,
  persistRecommendations,
  loadPersistedRecommendations,
  persistRecommendationEvaluations,
  persistResearchCandidates,
  loadPersistedResearchCandidates,
  persistResearchCandidateEvaluations,
  persistMarketAnomalySignals,
  loadMarketAnomalySignals,
  updateMarketAnomalySignals,
  persistTradeExecutions,
  loadPersistedTradeExecutions,
  persistPortfolioCashFlows,
  loadPersistedPortfolioCashFlows,
  persistPortfolioSnapshot,
  loadLatestPersistedPortfolioSnapshot,
  persistMarketSnapshots,
  persistPriceSnapshots,
  persistPriceProviderAttempt,
  persistInvestorFlow,
  persistDecisionContext,
  persistPerformanceReview,
  persistFinancialFreedomGoal,
  persistConversationMessage,
  persistPendingAction,
  loadPendingAction,
  loadPendingActionsForChat,
  createCollectorRun,
  updateCollectorRun,
  getLastSuccessfulCollectorRun,
  upsertSourceCursor,
  tryAcquireJobLock,
  releaseJobLock,
  loadWorkerJobRun,
  persistWorkerJobRun,
  persistWorkerHeartbeat,
  persistAlertEvents,
  loadBufferedDigestArticles,
  loadAlertEventsForArticles,
  loadRecentImmediateAlertEvents,
  summarizeHttpError,
  shouldRetrySupabaseError,
  parseRetryAfterMs,
  getRetryDelayMs,
};
