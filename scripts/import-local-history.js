const fs = require('fs');
const path = require('path');
const {
  isPersistenceEnabled,
  persistArticles,
  persistDailySummary,
  persistStockReport,
  persistRecommendations,
  persistRecommendationEvaluations,
  persistTradeExecutions,
  persistPortfolioSnapshot,
  persistMarketSnapshots,
  persistDecisionContext,
} = require('../src/utils/persistence');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function listJSONFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(file => file.endsWith('.json'))
      .sort()
      .map(file => path.join(dir, file));
  } catch {
    return [];
  }
}

function dateFromFile(file) {
  return path.basename(file, '.json');
}

function completedEvaluationsFromRecommendations(recommendations) {
  const completed = [];
  for (const recommendation of recommendations || []) {
    for (const [day, evaluation] of Object.entries(recommendation.evaluations || {})) {
      completed.push({
        recommendation,
        day: Number(day),
        evaluation,
      });
    }
  }
  return completed;
}

async function persistOrThrow(operation, label) {
  const result = await operation;
  if (result?.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result;
}

async function importArticles() {
  let total = 0;
  const archiveDir = path.join(DATA_DIR, 'daily-articles');
  for (const file of listJSONFiles(archiveDir)) {
    const articles = readJSON(file, []);
    await persistOrThrow(persistArticles(articles, dateFromFile(file)), `articles ${dateFromFile(file)}`);
    total += articles.length;
  }

  const buffer = readJSON(path.join(DATA_DIR, 'article-buffer.json'), []);
  if (buffer.length > 0) {
    await persistOrThrow(persistArticles(buffer), 'article buffer');
    total += buffer.length;
  }

  return total;
}

async function importDailySummaries() {
  let total = 0;
  const summaryDir = path.join(DATA_DIR, 'daily-summary');
  for (const file of listJSONFiles(summaryDir)) {
    const summary = readJSON(file, null);
    if (!summary) continue;
    await persistOrThrow(persistDailySummary(summary), `daily summary ${dateFromFile(file)}`);
    if (summary.stockReport) {
      await persistOrThrow(
        persistStockReport(summary.stockReport, summary.date || dateFromFile(file)),
        `stock report ${dateFromFile(file)}`
      );
      if (summary.stockReport.decision) {
        await persistOrThrow(
          persistDecisionContext(summary.stockReport.decision, summary.date || dateFromFile(file)),
          `decision context ${dateFromFile(file)}`
        );
      }
    }
    if (summary.indicators?.marketSnapshot) {
      await persistOrThrow(
        persistMarketSnapshots(
          summary.indicators.marketSnapshot,
          'summary',
          `${summary.date || dateFromFile(file)}T00:00:00+09:00`
        ),
        `market snapshot ${dateFromFile(file)}`
      );
    }
    total++;
  }
  return total;
}

async function importRecommendations() {
  const file = path.join(DATA_DIR, 'recommendations', 'recommendations.json');
  const recommendations = readJSON(file, []);
  if (recommendations.length === 0) return { recommendations: 0, evaluations: 0 };

  await persistOrThrow(persistRecommendations(recommendations), 'recommendations');
  const evaluations = completedEvaluationsFromRecommendations(recommendations);
  await persistOrThrow(persistRecommendationEvaluations(evaluations), 'recommendation evaluations');
  return { recommendations: recommendations.length, evaluations: evaluations.length };
}

async function importTradeExecutions() {
  const file = path.join(DATA_DIR, 'trades', 'trade-executions.json');
  const trades = readJSON(file, []);
  if (trades.length === 0) return 0;
  await persistOrThrow(persistTradeExecutions(trades), 'trade executions');
  return trades.length;
}

async function importPortfolioSnapshots() {
  let total = 0;
  const snapshotDir = path.join(DATA_DIR, 'portfolio-snapshots');
  for (const file of listJSONFiles(snapshotDir)) {
    const snapshot = readJSON(file, null);
    if (!snapshot) continue;
    await persistOrThrow(persistPortfolioSnapshot(snapshot), `portfolio snapshot ${dateFromFile(file)}`);
    total++;
  }
  return total;
}

async function main() {
  if (!isPersistenceEnabled()) {
    console.error('SUPABASE_PROJECT_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_PUBLISHABLE_KEY are required.');
    process.exit(1);
  }

  const articles = await importArticles();
  const summaries = await importDailySummaries();
  const recommendationResult = await importRecommendations();
  const trades = await importTradeExecutions();
  const portfolioSnapshots = await importPortfolioSnapshots();

  console.log(`[DB] imported articles: ${articles}`);
  console.log(`[DB] imported daily summaries: ${summaries}`);
  console.log(`[DB] imported recommendations: ${recommendationResult.recommendations}`);
  console.log(`[DB] imported recommendation evaluations: ${recommendationResult.evaluations}`);
  console.log(`[DB] imported trade executions: ${trades}`);
  console.log(`[DB] imported portfolio snapshots: ${portfolioSnapshots}`);
}

main().catch(err => {
  console.error('[DB] import failed:', err.message);
  process.exit(1);
});
