const fs = require('fs');
const path = require('path');
const STRATEGY_POLICY = require('../config/strategy-policy');
const { selectRows } = require('./persistence');

const REVIEW_DIR = path.join(__dirname, '..', '..', 'data', 'performance-reviews');

function readLocalReviews(dir = REVIEW_DIR) {
  try {
    return fs.readdirSync(dir)
      .filter(file => file.endsWith('.json'))
      .map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  } catch {
    return [];
  }
}

function latestReview(reviews = []) {
  return [...reviews].sort((a, b) => String(b.generatedAt || b.endDate || '').localeCompare(String(a.generatedAt || a.endDate || '')))[0] || null;
}

function hasFailure(review = {}, reason) {
  return (review.performanceLab?.failureAnalysis || []).some(item => item.reason === reason && item.count > 0);
}

function buildPerformanceLearningFromReview(review = null) {
  const baseMinRiskReward = STRATEGY_POLICY.recommendationRules.minRiskReward;
  const actions = [];
  const rules = {
    minRiskReward: baseMinRiskReward,
    requireStop: false,
    requireEntryTimingApproval: false,
    blockWatchOnlyBuys: true,
  };
  const sources = [];
  if (!review) {
    return {
      generatedAt: new Date().toISOString(),
      sourceReviewId: '',
      rules,
      actions,
      sources,
    };
  }

  const behavior = review.behaviorReview || {};
  const hygiene = behavior.recommendationHygiene || {};
  const collector = review.collectorOps || {};

  if (hasFailure(review, 'low_risk_reward') || (hygiene.belowMinRiskReward || 0) > 0) {
    rules.minRiskReward = Math.max(rules.minRiskReward, baseMinRiskReward + 0.5);
    actions.push('최근 손익비 부족 실패가 있어 최소 손익비를 일시적으로 0.5 상향합니다.');
    sources.push('low_risk_reward');
  }
  if ((hygiene.missingStop || 0) > 0 || hasFailure(review, 'large_drawdown') || hasFailure(review, 'stop_touched')) {
    rules.requireStop = true;
    actions.push('손절/최대낙폭 문제가 있어 손절가 또는 예상 손실폭이 없는 추천은 관찰 후보로 내립니다.');
    sources.push('stop_or_drawdown');
  }
  if (hasFailure(review, 'large_drawdown') || collector.staleSuccess) {
    rules.requireEntryTimingApproval = true;
    actions.push('큰 낙폭 또는 운영 공백이 있어 진입 타이밍 승인 없는 추천은 관찰 후보로 내립니다.');
    sources.push('entry_timing_required');
  }
  if ((review.tradeSummary?.linkedRatePct ?? 100) < 70 || (behavior.tradeReview?.unlinkedBuys || 0) > 0) {
    actions.push('실제 매수는 추천 ID와 연결해 기록하고, 추천 외 매수는 행동 리뷰 대상으로 둡니다.');
    sources.push('execution_linkage');
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceReviewId: review.id || '',
    sourcePeriod: review.period || '',
    rules,
    actions: [...new Set(actions)].slice(0, 6),
    sources: [...new Set(sources)],
  };
}

async function loadLatestPerformanceLearning() {
  const result = await selectRows('performance_reviews', {
    select: '*',
    order: 'created_at.desc,generated_at.desc',
    limit: '1',
  });
  const remote = result.rows?.[0]?.payload || result.rows?.[0] || null;
  const local = latestReview(readLocalReviews());
  const review = remote || local;
  return buildPerformanceLearningFromReview(review);
}

module.exports = {
  buildPerformanceLearningFromReview,
  loadLatestPerformanceLearning,
  readLocalReviews,
};
