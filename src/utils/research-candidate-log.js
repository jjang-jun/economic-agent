const fs = require('fs');
const path = require('path');
const { getKSTDate } = require('./article-archive');
const {
  buildRecommendation,
  evaluateRecommendationCollection,
  resolveRecommendationAiMetadata,
  shouldLogRecommendation,
} = require('./recommendation-log');
const {
  loadPersistedResearchCandidates,
  persistResearchCandidates,
  persistResearchCandidateEvaluations,
} = require('./persistence');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'research-candidates');
const LOG_FILE = path.join(DATA_DIR, 'research-candidates.json');

function loadLocalResearchCandidates() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveResearchCandidates(candidates) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, JSON.stringify(candidates, null, 2));
}

async function loadResearchCandidatesWithStatus() {
  const local = loadLocalResearchCandidates();
  const persisted = await loadPersistedResearchCandidates();
  if (persisted.error || persisted.disabled || !persisted.rows) {
    return {
      candidates: local,
      dataAvailable: local.length > 0,
      source: local.length > 0 ? 'local_fallback' : 'unavailable',
      persistenceAvailable: false,
      error: persisted.error?.message || (persisted.disabled ? 'persistence disabled' : 'persistence unavailable'),
    };
  }

  const byId = new Map(local.filter(item => item.id).map(item => [item.id, item]));
  for (const candidate of persisted.rows) {
    if (candidate?.id) byId.set(candidate.id, candidate);
  }
  const merged = [...byId.values()];
  saveResearchCandidates(merged);
  return {
    candidates: merged,
    dataAvailable: true,
    source: 'supabase',
    persistenceAvailable: true,
    error: '',
  };
}

async function loadResearchCandidates() {
  const result = await loadResearchCandidatesWithStatus();
  return result.candidates;
}

function shouldTrackResearchCandidate(stock = {}) {
  if (stock.schema_validation?.passed !== true) return false;
  if (!['bullish', 'bearish'].includes(stock.signal)) return false;
  return !shouldLogRecommendation(stock);
}

function getResearchCandidateId(date, stock) {
  const key = stock.ticker || stock.name || '';
  return `shadow:${date}:${key}:${stock.signal || 'neutral'}`;
}

async function logResearchCandidates(report, context = {}) {
  const stocks = report?.stocks || [];
  if (stocks.length === 0) return { added: 0, skipped: 0 };

  const date = context.date || getKSTDate();
  const existing = await loadResearchCandidates();
  const byId = new Map(existing.map(item => [item.id, item]));
  let added = 0;
  let skipped = 0;

  for (const stock of stocks) {
    if (!shouldTrackResearchCandidate(stock)) {
      skipped++;
      continue;
    }
    const id = getResearchCandidateId(date, stock);
    if (byId.has(id)) {
      skipped++;
      continue;
    }
    const blockers = [...new Set(stock.risk_review?.blockers || [])];
    const candidate = await buildRecommendation(
      stock,
      context.articles || [],
      context.indicators || {},
      date,
      resolveRecommendationAiMetadata(stock, report, context),
      {
        useAnalysisEntry: true,
        analysisTimestamp: report.generatedAt || report.createdAt || new Date().toISOString(),
        trackingCohort: 'shadow',
        decisionStatus: 'rejected',
        rejectionReasons: blockers,
        researchOnly: true,
        tradeEligible: false,
      },
    );
    candidate.id = id;
    candidate.marketRegime = report.decision?.market?.regime || '';
    candidate.marketScore = report.decision?.market?.score ?? null;
    byId.set(id, candidate);
    added++;
  }

  const candidates = [...byId.values()];
  saveResearchCandidates(candidates);
  const persisted = await persistResearchCandidates(candidates);
  if (persisted.error) throw new Error(`Shadow 후보 저장 실패: ${persisted.error.message}`);
  return { added, skipped };
}

async function evaluateResearchCandidates() {
  const candidates = await loadResearchCandidates();
  return evaluateRecommendationCollection(candidates, {
    saveItems: saveResearchCandidates,
    persistItems: persistResearchCandidates,
    persistEvaluations: persistResearchCandidateEvaluations,
    itemLabel: 'Shadow 후보',
  });
}

module.exports = {
  loadLocalResearchCandidates,
  saveResearchCandidates,
  loadResearchCandidatesWithStatus,
  loadResearchCandidates,
  shouldTrackResearchCandidate,
  getResearchCandidateId,
  logResearchCandidates,
  evaluateResearchCandidates,
};
