const fs = require('fs');
const path = require('path');
const {
  buildPerformanceLab,
  aiModelKey,
  aiVersionKey,
  promptVersionKey,
  isEligibleRecommendation,
  evaluationAtHorizon,
} = require('../src/utils/performance-lab');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data', 'supabase');
const DEFAULT_MIN_EVALUATED = 30;
const DEFAULT_HORIZON_DAYS = 20;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function recommendationFromRow(row = {}) {
  const payload = row.payload || {};
  return {
    ...payload,
    id: row.id || payload.id,
    date: row.date || payload.date,
    name: row.name || payload.name,
    ticker: row.ticker || payload.ticker,
    signal: row.signal || payload.signal,
    conviction: row.conviction || payload.conviction,
    aiProvider: row.ai_provider || payload.aiProvider || payload.ai_provider,
    aiModel: row.ai_model || payload.aiModel || payload.ai_model,
    promptVersion: row.prompt_version || payload.promptVersion || payload.prompt_version,
    aiMetadata: row.ai_metadata || payload.aiMetadata || payload.ai_metadata,
    riskProfile: row.risk_profile || payload.riskProfile || payload.risk_profile,
    riskReview: row.risk_review || payload.riskReview || payload.risk_review,
    marketProfile: row.market_profile || payload.marketProfile || payload.market_profile,
    evaluations: payload.evaluations || {},
  };
}

function attachLatestEvaluations(recommendations = [], evaluationRows = [], foreignKey = 'recommendation_id') {
  const byRecommendation = new Map(recommendations.map(item => [item.id, item]));
  for (const row of evaluationRows || []) {
    const recommendation = byRecommendation.get(row[foreignKey]);
    if (!recommendation || typeof row.signal_return_pct !== 'number') continue;
    recommendation.evaluations = recommendation.evaluations || {};
    recommendation.evaluations[String(row.day)] = {
      ...(row.payload || {}),
      signalReturnPct: row.signal_return_pct,
      alphaPct: row.alpha_pct,
      stopTouched: row.stop_touched,
      targetTouched: row.target_touched,
      maxDrawdownPct: row.max_drawdown_pct,
    };
  }
  return recommendations;
}

function isUnknownModelKey(key) {
  return key === 'unknown_provider:unknown_model'
    || key === 'legacy_prompt'
    || String(key || '').includes('unknown_provider:unknown_model')
    || String(key || '').includes('legacy_prompt');
}

function summaryLine(item, minEvaluated = DEFAULT_MIN_EVALUATED) {
  const count = item.evaluated || 0;
  const avg = typeof item.avgSignalReturnPct === 'number' ? `${item.avgSignalReturnPct}%` : '데이터 부족';
  const win = typeof item.winRatePct === 'number' ? `${item.winRatePct}%` : '데이터 부족';
  const readiness = item.metadataMissing
    ? '메타데이터 누락'
    : (count >= minEvaluated ? '판단 가능' : `표본 부족(${count}/${minEvaluated})`);
  return `${item.key} | 평가 ${count}건 | 평균 ${avg} | 승률 ${win} | ${readiness}`;
}

function countMissingMetadata(recommendations = []) {
  return recommendations.filter(item => (
    aiModelKey(item) === 'unknown_provider:unknown_model'
    || promptVersionKey(item) === 'legacy_prompt'
  )).length;
}

function hasKnownMetadata(recommendation = {}) {
  return !(
    aiModelKey(recommendation) === 'unknown_provider:unknown_model'
    || promptVersionKey(recommendation) === 'legacy_prompt'
  );
}

function metadataCoverage(recommendations = []) {
  const evaluated = recommendations.filter(item => Object.keys(item.evaluations || {}).length > 0);
  const unevaluated = recommendations.filter(item => Object.keys(item.evaluations || {}).length === 0);
  const totalWithMetadata = recommendations.filter(hasKnownMetadata).length;
  const evaluatedWithMetadata = evaluated.filter(hasKnownMetadata).length;
  const unevaluatedWithMetadata = unevaluated.filter(hasKnownMetadata).length;

  return {
    totalWithMetadata,
    totalMissingMetadata: recommendations.length - totalWithMetadata,
    evaluatedWithMetadata,
    evaluatedMissingMetadata: evaluated.length - evaluatedWithMetadata,
    unevaluatedWithMetadata,
    unevaluatedMissingMetadata: unevaluated.length - unevaluatedWithMetadata,
  };
}

function buildModelPerformanceReadiness({
  recommendationRows = [],
  evaluationRows = [],
  researchCandidateRows = [],
  researchEvaluationRows = [],
  minEvaluated = DEFAULT_MIN_EVALUATED,
  horizonDays = DEFAULT_HORIZON_DAYS,
} = {}) {
  const recommendations = attachLatestEvaluations(
    recommendationRows.map(recommendationFromRow),
    evaluationRows
  );
  const eligible = recommendations.filter(isEligibleRecommendation);
  const lab = buildPerformanceLab({
    recommendations,
    trades: [],
    primaryHorizonDays: horizonDays,
    groupMinEvaluated: minEvaluated,
  });
  const evaluated = eligible.filter(item => evaluationAtHorizon(item, horizonDays));
  const researchCandidates = attachLatestEvaluations(
    researchCandidateRows.map(recommendationFromRow),
    researchEvaluationRows,
    'candidate_id',
  );
  const shadowLab = buildPerformanceLab({
    recommendations: researchCandidates,
    trades: [],
    primaryHorizonDays: horizonDays,
    groupMinEvaluated: minEvaluated,
    eligibilityPredicate: item => (
      item.researchOnly === true
      && item.tradeEligible === false
      && ['bullish', 'bearish'].includes(item.signal)
      && typeof item.entry?.price === 'number'
    ),
  });

  return {
    generatedAt: new Date().toISOString(),
    totalRecommendations: recommendations.length,
    eligibleRecommendations: eligible.length,
    evaluatedRecommendations: lab.recommendationQuality.evaluated,
    minEvaluated,
    horizonDays,
    missingMetadata: countMissingMetadata(evaluated),
    metadataCoverage: metadataCoverage(eligible),
    modelLeaders: lab.leaders.aiModels.map(item => ({
      ...item,
      metadataMissing: isUnknownModelKey(item.key),
      ready: !isUnknownModelKey(item.key) && (item.evaluated || 0) >= minEvaluated,
    })),
    promptLeaders: lab.leaders.promptVersions.map(item => ({
      ...item,
      metadataMissing: isUnknownModelKey(item.key),
      ready: !isUnknownModelKey(item.key) && (item.evaluated || 0) >= minEvaluated,
    })),
    versionLeaders: lab.leaders.aiVersions.map(item => ({
      ...item,
      metadataMissing: isUnknownModelKey(item.key),
      ready: !isUnknownModelKey(item.key) && (item.evaluated || 0) >= minEvaluated,
    })),
    shadow: {
      totalCandidates: researchCandidates.length,
      eligibleCandidates: shadowLab.eligibility.eligibleRecommendations,
      evaluatedCandidates: shadowLab.recommendationQuality.evaluated,
      modelLeaders: shadowLab.leaders.aiModels,
      promptLeaders: shadowLab.leaders.promptVersions,
      researchOnly: true,
    },
  };
}

function formatReadiness(readiness) {
  const lines = [
    '모델/프롬프트 성과 판단 준비도',
    `추천 ${readiness.totalRecommendations}건 · 평가 완료 ${readiness.evaluatedRecommendations}건 · 기준 ${readiness.minEvaluated}건`,
    `검증 계약 통과 추천: ${readiness.eligibleRecommendations ?? readiness.totalRecommendations}건 · 고정 ${readiness.horizonDays || 20}거래일 평가`,
    `메타데이터 누락 평가 추천: ${readiness.missingMetadata}건`,
    `메타데이터 보유 추천: ${readiness.metadataCoverage?.totalWithMetadata || 0}건 · 평가 대기 중 메타데이터 보유: ${readiness.metadataCoverage?.unevaluatedWithMetadata || 0}건`,
    '',
    '[모델별]',
    ...(readiness.modelLeaders.length
      ? readiness.modelLeaders.map(item => summaryLine(item, readiness.minEvaluated))
      : ['데이터 부족']),
    '',
    '[프롬프트별]',
    ...(readiness.promptLeaders.length
      ? readiness.promptLeaders.map(item => summaryLine(item, readiness.minEvaluated))
      : ['데이터 부족']),
    '',
    '[프롬프트+모델 설정별]',
    ...(readiness.versionLeaders.length
      ? readiness.versionLeaders.map(item => summaryLine(item, readiness.minEvaluated))
      : ['데이터 부족']),
    '',
    '[Shadow 연구 코호트 · 실제 추천과 분리]',
    `후보 ${readiness.shadow?.totalCandidates || 0}건 · 고정 ${readiness.horizonDays || 20}거래일 평가 ${readiness.shadow?.evaluatedCandidates || 0}건`,
    ...((readiness.shadow?.modelLeaders || []).length
      ? readiness.shadow.modelLeaders.map(item => summaryLine(item, readiness.minEvaluated))
      : ['데이터 부족']),
  ];
  return lines.join('\n');
}

function main() {
  const dataDir = process.env.SUPABASE_MIRROR_DIR || DEFAULT_DATA_DIR;
  const minEvaluated = Number(process.env.MODEL_PERFORMANCE_MIN_EVALUATED || DEFAULT_MIN_EVALUATED);
  const readiness = buildModelPerformanceReadiness({
    recommendationRows: readJson(path.join(dataDir, 'recommendations.json')),
    evaluationRows: readJson(path.join(dataDir, 'recommendation_evaluations.json')),
    researchCandidateRows: readJson(path.join(dataDir, 'research_candidates.json')),
    researchEvaluationRows: readJson(path.join(dataDir, 'research_candidate_evaluations.json')),
    minEvaluated,
  });

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(readiness, null, 2));
  } else {
    console.log(formatReadiness(readiness));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildModelPerformanceReadiness,
  formatReadiness,
  recommendationFromRow,
  attachLatestEvaluations,
  countMissingMetadata,
  metadataCoverage,
  hasKnownMetadata,
  isUnknownModelKey,
};
