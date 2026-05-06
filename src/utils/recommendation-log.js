const fs = require('fs');
const path = require('path');
const { getKSTDate } = require('./article-archive');
const { fetchQuote, normalizeYahooSymbol } = require('../sources/yahoo-finance');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'recommendations');
const LOG_FILE = path.join(DATA_DIR, 'recommendations.json');
const EVALUATION_DAYS = [1, 5, 20];

function loadRecommendations() {
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
  const quote = symbol ? await fetchQuote(symbol) : null;

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
    relatedNews: getRelatedArticleIds(stock, articles),
    indicators,
    entry: quote
      ? {
          price: quote.price,
          currency: quote.currency,
          marketTime: quote.marketTime,
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
  const existing = loadRecommendations();
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

async function evaluateRecommendations() {
  const recommendations = loadRecommendations();
  const completed = [];

  for (const recommendation of recommendations) {
    if (!recommendation.entry?.price || !recommendation.symbol) continue;

    const ageDays = daysSince(recommendation.date);
    const dueTargets = EVALUATION_DAYS.filter(
      day => ageDays >= day && !recommendation.evaluations[String(day)]
    );
    if (dueTargets.length === 0) continue;

    const quote = await fetchQuote(recommendation.symbol);
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
      completed.push({ recommendation, day, evaluation: recommendation.evaluations[String(day)] });
    }

    const done = EVALUATION_DAYS.every(day => recommendation.evaluations[String(day)]);
    recommendation.status = done ? 'evaluated' : 'open';
  }

  saveRecommendations(recommendations);
  return { completed, total: recommendations.length };
}

module.exports = {
  EVALUATION_DAYS,
  loadRecommendations,
  saveRecommendations,
  logRecommendations,
  evaluateRecommendations,
  calculateReturn,
};
