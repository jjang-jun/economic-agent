const { EXPERT_ROLES } = require('../config/expert-roles');
const strategyPolicy = require('../config/strategy-policy');
const { loadPortfolio } = require('../utils/portfolio');
const { loadStoredPortfolio } = require('../utils/portfolio-store');
const { buildFreedomStatus } = require('../utils/freedom-engine');
const { loadRecommendationsWithStatus } = require('../utils/recommendation-log');
const { loadTradeExecutionsWithStatus } = require('../utils/trade-log');
const { loadRecentPolicyEvents } = require('../utils/policy-event-store');
const { loadRealEstateGoal } = require('../config/real-estate-goal');
const { buildTargetRangeScenarios } = require('../utils/housing-finance');
const { selectRows } = require('../utils/persistence');

const DEFAULT_CONTEXT_MAX_CHARS = 6_000;

function clip(value = '', max = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactPortfolio(portfolio = {}) {
  return {
    capturedAt: portfolio.capturedAt || portfolio.updatedAt || '',
    currency: portfolio.currency || 'KRW',
    totalAssetValue: numeric(portfolio.totalAssetValue),
    cashAmount: numeric(portfolio.cashAmount),
    cashRatio: numeric(portfolio.cashRatio),
    unclassifiedAssetAmount: numeric(portfolio.unclassifiedAssetAmount),
    positions: (portfolio.positions || []).slice(0, 8).map(position => ({
      ticker: position.ticker || position.symbol || '',
      name: position.name || '',
      sector: position.sector || '',
      quantity: numeric(position.quantity),
      avgPrice: numeric(position.avgPrice),
      currentPrice: numeric(position.currentPrice),
      marketValue: numeric(position.marketValue),
      weight: numeric(position.weight),
    })),
  };
}

function compactFreedomStatus(status = {}) {
  return {
    generatedAt: status.generatedAt || '',
    currentNetWorth: numeric(status.currentNetWorth),
    targetNetWorth: numeric(status.goal?.targetNetWorth),
    targetProgressPct: numeric(status.targetProgressPct),
    targetDate: status.targetDate || '',
    estimatedTargetDate: status.estimatedTargetDate || '',
    monthlySavingAmount: numeric(status.monthlySavingAmount),
    expectedAnnualReturnPct: numeric(status.expectedAnnualReturnPct),
    requiredAnnualReturnPct: numeric(status.requiredAnnualReturnPct),
    stressDrawdownPct: numeric(status.stress?.drawdownPct),
    stressDelayMonths: numeric(status.stress?.delayMonths),
  };
}

function compactRecommendations(recommendations = []) {
  return [...recommendations]
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0))
    .slice(0, 5)
    .map(item => ({
      id: item.id || '',
      date: item.date || item.createdAt || '',
      ticker: item.ticker || item.symbol || '',
      name: item.name || '',
      signal: item.signal || '',
      conviction: item.conviction || '',
      decisionStatus: item.decisionStatus || '',
      tradeEligible: item.tradeEligible !== false,
      thesis: clip(item.thesis || item.reason, 180),
      invalidation: clip(item.invalidation || item.risk, 140),
      entryPrice: numeric(item.entry?.price || item.riskProfile?.entryReferencePrice),
      stopPrice: numeric(item.riskProfile?.stopPrice),
      riskApproved: item.riskReview?.approved ?? null,
    }));
}

function compactTrades(trades = []) {
  return [...trades]
    .sort((a, b) => new Date(b.executedAt || b.date || 0) - new Date(a.executedAt || a.date || 0))
    .slice(0, 6)
    .map(trade => ({
      id: trade.id || '',
      executedAt: trade.executedAt || trade.date || '',
      side: trade.side || '',
      ticker: trade.ticker || trade.symbol || '',
      name: trade.name || '',
      quantity: numeric(trade.quantity),
      price: numeric(trade.price),
      currency: trade.currency || '',
      cashAmountKrw: numeric(trade.cashAmountKrw),
      realizedPnlKrw: numeric(trade.realizedPnlKrw),
      sellReason: clip(trade.sellReason, 120),
    }));
}

function compactPolicyEvents(events = []) {
  return (events || []).slice(0, 5).map(event => ({
    title: clip(event.title, 120),
    domains: [...new Set([event.domain, ...(event.domains || [])].filter(Boolean))],
    stage: event.stageLabel || event.stage || '',
    authority: event.authority || '',
    publishedAt: event.publishedAt || '',
    summary: clip(event.summary, 160),
    action: clip(event.action, 100),
    sourceUrl: event.link || '',
  }));
}

function clipContext(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 28))}\n[context truncated]`;
}

async function safeLoad(name, loader) {
  try {
    return { ok: true, name, value: await loader(), error: '' };
  } catch (err) {
    return { ok: false, name, value: null, error: err.message || String(err) };
  }
}

async function buildExpertContext(roleId, options = {}) {
  const role = EXPERT_ROLES[roleId];
  if (!role) throw new Error(`Unknown expert role: ${roleId}`);
  const env = options.env || process.env;
  const portfolioLoader = options.portfolioLoader || (async () => (
    await loadStoredPortfolio() || loadPortfolio()
  ));
  const recommendationLoader = options.recommendationLoader || loadRecommendationsWithStatus;
  const tradeLoader = options.tradeLoader || loadTradeExecutionsWithStatus;
  const policyLoader = options.policyLoader || loadRecentPolicyEvents;
  const realEstateMarketLoader = options.realEstateMarketLoader || (async () => selectRows('real_estate_area_metrics', {
    select: 'metric_month,area_code,area_name,transaction_count,median_price_krw,price_change_1m_pct,transaction_change_1m_pct,jeonse_ratio,payload,source_cutoff_at',
    order: 'metric_month.desc,transaction_count.desc',
    limit: '12',
  }));
  const realEstateIndexLoader = options.realEstateIndexLoader || (async () => selectRows('real_estate_market_indices', {
    select: 'period,area_id,area_name,area_path,index_value,change_1m_pct,change_3m_pct,change_12m_pct,drawdown_from_24m_high_pct,observed_at',
    order: 'period.desc,area_path.asc',
    limit: '20',
  }));
  let portfolioPromise;
  const getPortfolio = () => {
    portfolioPromise ||= portfolioLoader();
    return portfolioPromise;
  };

  const loaders = {
    portfolio: async () => {
      const portfolio = await getPortfolio();
      return { data: compactPortfolio(portfolio || {}), source: portfolio ? 'portfolio_ssot' : 'unavailable' };
    },
    freedom_goal: async () => {
      const portfolio = await getPortfolio();
      return { data: compactFreedomStatus(buildFreedomStatus({ portfolio: portfolio || {} })), source: 'freedom_engine' };
    },
    real_estate_goal: async () => {
      const goal = loadRealEstateGoal(env);
      return {
        data: { goal, financingScenarios: buildTargetRangeScenarios({ goal }) },
        source: 'real_estate_goal_ssot',
      };
    },
    real_estate_market: async () => {
      const result = await realEstateMarketLoader();
      return {
        data: (result?.rows || []).map(row => ({
          month: row.metric_month,
          areaCode: row.area_code,
          areaName: row.area_name,
          transactions: numeric(row.transaction_count),
          medianPriceKrw: numeric(row.median_price_krw),
          priceChange1mPct: numeric(row.price_change_1m_pct),
          transactionChange1mPct: numeric(row.transaction_change_1m_pct),
          jeonseRatio: numeric(row.jeonse_ratio),
          marketPhase: row.payload?.marketPhase || '',
          cutoffAt: row.source_cutoff_at || '',
        })),
        source: result?.disabled ? 'unavailable' : 'real_estate_area_metrics',
        warning: result?.error?.message || '',
      };
    },
    real_estate_indices: async () => {
      const result = await realEstateIndexLoader();
      return {
        data: (result?.rows || []).map(row => ({
          period: row.period,
          areaId: row.area_id,
          areaName: row.area_name,
          areaPath: row.area_path,
          indexValue: numeric(row.index_value),
          change1mPct: numeric(row.change_1m_pct),
          change3mPct: numeric(row.change_3m_pct),
          change12mPct: numeric(row.change_12m_pct),
          drawdownFrom24mHighPct: numeric(row.drawdown_from_24m_high_pct),
          observedAt: row.observed_at || '',
        })),
        source: result?.disabled ? 'unavailable' : 'reb_r_one',
        warning: result?.error?.message || '',
      };
    },
    recommendations: async () => {
      const result = await recommendationLoader();
      return {
        data: compactRecommendations(result?.recommendations || result || []),
        source: result?.source || 'recommendation_store',
        warning: result?.error || '',
      };
    },
    recent_trades: async () => {
      const result = await tradeLoader();
      return {
        data: compactTrades(result?.trades || result || []),
        source: result?.source || 'trade_store',
        warning: result?.error || '',
      };
    },
    risk_policy: async () => ({
      data: {
        objective: strategyPolicy.objective,
        capitalRules: strategyPolicy.capitalRules,
        recommendationRules: strategyPolicy.recommendationRules,
        leverageRules: strategyPolicy.leverageRules,
      },
      source: 'strategy_policy',
    }),
    real_estate_policy: async () => {
      const result = await policyLoader({ domains: ['real_estate', 'loan_finance'], limit: 8 });
      return { data: compactPolicyEvents(result.events), source: result.source, warning: result.error || '' };
    },
    tax_policy: async () => {
      const result = await policyLoader({ domains: ['tax', 'pension', 'capital_market'], limit: 8 });
      return { data: compactPolicyEvents(result.events), source: result.source, warning: result.error || '' };
    },
    all_policy: async () => {
      const result = await policyLoader({ limit: 8 });
      return { data: compactPolicyEvents(result.events), source: result.source, warning: result.error || '' };
    },
  };

  const loaded = await Promise.all(role.contextScopes.map(scope => (
    safeLoad(scope, loaders[scope] || (async () => ({ data: null, source: 'unsupported_scope' })))
  )));
  const sections = {};
  const sources = {};
  const warnings = [];
  for (const item of loaded) {
    if (!item.ok) {
      sections[item.name] = null;
      sources[item.name] = 'unavailable';
      warnings.push(`${item.name}: ${item.error}`);
      continue;
    }
    sections[item.name] = item.value?.data ?? null;
    sources[item.name] = item.value?.source || '';
    if (item.value?.warning) warnings.push(`${item.name}: ${item.value.warning}`);
  }

  const generatedAt = new Date(options.now || Date.now()).toISOString();
  const snapshot = {
    role: { id: role.id, name: role.name, mission: role.mission },
    generatedAt,
    scopes: role.contextScopes,
    sources,
    warnings,
    sections,
  };
  const configuredMax = Number(env.DISCORD_EXPERT_CONTEXT_MAX_CHARS || DEFAULT_CONTEXT_MAX_CHARS);
  const maxChars = Math.max(2_000, Math.min(16_000, Number.isFinite(configuredMax) ? configuredMax : DEFAULT_CONTEXT_MAX_CHARS));
  return {
    role,
    snapshot,
    contextText: clipContext(JSON.stringify(snapshot), maxChars),
    dataCutoff: { generatedAt, sources },
  };
}

module.exports = {
  DEFAULT_CONTEXT_MAX_CHARS,
  buildExpertContext,
  clipContext,
  compactFreedomStatus,
  compactPolicyEvents,
  compactPortfolio,
  compactRecommendations,
  compactTrades,
  safeLoad,
};
