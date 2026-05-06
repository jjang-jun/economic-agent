const fs = require('fs');
const path = require('path');
const { getKSTDate } = require('./article-archive');
const { fetchQuote, fetchBenchmarkQuote, normalizeYahooSymbol } = require('../sources/yahoo-finance');
const {
  persistRecommendations,
  persistRecommendationEvaluations,
  loadPersistedRecommendations,
} = require('./persistence');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'recommendations');
const LOG_FILE = path.join(DATA_DIR, 'recommendations.json');
const EVALUATION_DAYS = [1, 5, 20];

function loadLocalRecommendations() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveRecommendations(recommendations) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, JSON.stringify(recommendations, null, 2));
}

async function loadRecommendations() {
  const local = loadLocalRecommendations();
  const persisted = await loadPersistedRecommendations();
  if (persisted.error || persisted.disabled || !persisted.rows) {
    return local;
  }

  const byId = new Map(local.filter(r => r.id).map(r => [r.id, r]));
  for (const recommendation of persisted.rows) {
    if (recommendation?.id) byId.set(recommendation.id, recommendation);
  }
  const merged = [...byId.values()];
  saveRecommendations(merged);
  return merged;
}

function getRecommendationId(date, stock) {
  const key = stock.ticker || stock.name || '';
  return `${date}:${key}:${stock.signal || 'neutral'}`;
}

function getRelatedArticleIds(stock, articles) {
  const indexes = Array.isArray(stock.related_news) ? stock.related_news : [];
  return indexes
    .map(i => articles[i]?.id)
    .filter(Boolean);
}

async function buildRecommendation(stock, articles, indicators, date) {
  const symbol = normalizeYahooSymbol(stock.ticker);
  const [quote, benchmark] = await Promise.all([
    symbol ? fetchQuote(symbol) : null,
    fetchBenchmarkQuote(),
  ]);

  return {
    id: getRecommendationId(date, stock),
    date,
    createdAt: new Date().toISOString(),
    name: stock.name || '',
    ticker: stock.ticker || '',
    symbol,
    signal: stock.signal || 'neutral',
    conviction: stock.conviction || 'low',
    reason: stock.reason || '',
    risk: stock.risk || '',
    invalidation: stock.invalidation || stock.risk_profile?.invalidation || '',
    riskProfile: stock.risk_profile || null,
    marketProfile: stock.market_profile || null,
    relatedNews: getRelatedArticleIds(stock, articles),
    indicators,
    entry: quote
      ? {
          price: quote.price,
          currency: quote.currency,
          marketTime: quote.marketTime,
        }
      : null,
    benchmark: benchmark
      ? {
          symbol: benchmark.symbol,
          entryPrice: benchmark.price,
          currency: benchmark.currency,
          marketTime: benchmark.marketTime,
        }
      : null,
    evaluations: {},
    status: quote ? 'open' : 'missing_price',
  };
}

async function logRecommendations(report, context = {}) {
  const stocks = report?.stocks || [];
  if (stocks.length === 0) return { added: 0, skipped: 0 };

  const date = getKSTDate();
  const existing = await loadRecommendations();
  const byId = new Map(existing.map(r => [r.id, r]));
  let added = 0;
  let skipped = 0;

  for (const stock of stocks) {
    const id = getRecommendationId(date, stock);
    if (byId.has(id)) {
      skipped++;
      continue;
    }
    const recommendation = await buildRecommendation(
      stock,
      context.articles || [],
      context.indicators || {},
      date
    );
    byId.set(id, recommendation);
    added++;
  }

  saveRecommendations([...byId.values()]);
  await persistRecommendations([...byId.values()]);
  return { added, skipped };
}

function daysSince(date) {
  const start = new Date(`${date}T00:00:00+09:00`).getTime();
  return Math.floor((Date.now() - start) / (24 * 60 * 60 * 1000));
}

function calculateReturn(signal, entryPrice, currentPrice) {
  const returnPct = ((currentPrice - entryPrice) / entryPrice) * 100;
  const signalReturnPct = signal === 'bearish' ? -returnPct : returnPct;
  return {
    returnPct: Number(returnPct.toFixed(2)),
    signalReturnPct: Number(signalReturnPct.toFixed(2)),
  };
}

function calculateBenchmarkReturn(entryPrice, currentPrice) {
  if (!entryPrice || !currentPrice) return null;
  return Number((((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2));
}

async function evaluateRecommendations() {
  const recommendations = await loadRecommendations();
  const completed = [];

  for (const recommendation of recommendations) {
    if (!recommendation.entry?.price || !recommendation.symbol) continue;

    const ageDays = daysSince(recommendation.date);
    const dueTargets = EVALUATION_DAYS.filter(
      day => ageDays >= day && !recommendation.evaluations[String(day)]
    );
    if (dueTargets.length === 0) continue;

    const [quote, benchmarkQuote] = await Promise.all([
      fetchQuote(recommendation.symbol),
      recommendation.benchmark?.symbol ? fetchQuote(recommendation.benchmark.symbol) : null,
    ]);
    if (!quote) continue;

    for (const day of dueTargets) {
      const result = calculateReturn(
        recommendation.signal,
        recommendation.entry.price,
        quote.price
      );
      recommendation.evaluations[String(day)] = {
        day,
        evaluatedAt: new Date().toISOString(),
        price: quote.price,
        currency: quote.currency,
        marketTime: quote.marketTime,
        ...result,
      };
      if (recommendation.benchmark?.entryPrice && benchmarkQuote?.price) {
        const benchmarkReturnPct = calculateBenchmarkReturn(
          recommendation.benchmark.entryPrice,
          benchmarkQuote.price
        );
        recommendation.evaluations[String(day)].benchmark = {
          symbol: recommendation.benchmark.symbol,
          price: benchmarkQuote.price,
          returnPct: benchmarkReturnPct,
        };
        recommendation.evaluations[String(day)].alphaPct = Number(
          (result.signalReturnPct - benchmarkReturnPct).toFixed(2)
        );
      }
      completed.push({ recommendation, day, evaluation: recommendation.evaluations[String(day)] });
    }

    const done = EVALUATION_DAYS.every(day => recommendation.evaluations[String(day)]);
    recommendation.status = done ? 'evaluated' : 'open';
  }

  saveRecommendations(recommendations);
  await persistRecommendations(recommendations);
  await persistRecommendationEvaluations(completed);
  return { completed, total: recommendations.length };
}

module.exports = {
  EVALUATION_DAYS,
  loadRecommendations,
  loadLocalRecommendations,
  saveRecommendations,
  logRecommendations,
  evaluateRecommendations,
  calculateReturn,
  calculateBenchmarkReturn,
};
