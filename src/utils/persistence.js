const { getKSTDate } = require('./article-archive');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY;

function isPersistenceEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function getHeaders(prefer = 'resolution=merge-duplicates') {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function upsert(table, rows, onConflict) {
  if (!isPersistenceEnabled() || !rows || rows.length === 0) return { saved: 0 };

  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  if (onConflict) url.searchParams.set('on_conflict', onConflict);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${body}`);
    }
    return { saved: rows.length };
  } catch (err) {
    console.warn(`[DB] ${table} 저장 실패: ${err.message}`);
    return { saved: 0, error: err };
  }
}

async function selectRows(table, params = {}) {
  if (!isPersistenceEnabled()) return { rows: null, disabled: true };

  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  try {
    const res = await fetch(url, {
      headers: getHeaders(''),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${body}`);
    }
    return { rows: await res.json() };
  } catch (err) {
    console.warn(`[DB] ${table} 조회 실패: ${err.message}`);
    return { rows: null, error: err };
  }
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

function recommendationRow(recommendation) {
  return {
    id: recommendation.id,
    date: recommendation.date,
    name: recommendation.name || '',
    ticker: recommendation.ticker || '',
    symbol: recommendation.symbol || '',
    signal: recommendation.signal || 'neutral',
    conviction: recommendation.conviction || 'low',
    reason: recommendation.reason || '',
    risk: recommendation.risk || '',
    invalidation: recommendation.invalidation || '',
    risk_profile: recommendation.riskProfile || recommendation.risk_profile || null,
    market_profile: recommendation.marketProfile || recommendation.market_profile || null,
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

module.exports = {
  isPersistenceEnabled,
  selectRows,
  persistArticles,
  persistDailySummary,
  persistStockReport,
  persistRecommendations,
  loadPersistedRecommendations,
  persistRecommendationEvaluations,
  persistTradeExecutions,
  persistPortfolioSnapshot,
  persistMarketSnapshots,
  persistInvestorFlow,
  persistDecisionContext,
};
