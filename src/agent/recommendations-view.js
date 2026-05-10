const { loadRecommendations } = require('../utils/recommendation-log');
const { formatKRW } = require('../utils/decision-engine');
const STRATEGY_POLICY = require('../config/strategy-policy');
const { escapeHtml } = require('./response-composer');

const SIGNAL_LABELS = {
  bullish: '상승 후보',
  bearish: '하락/축소 후보',
  neutral: '관찰',
};

const CONVICTION_LABELS = {
  high: '신뢰도 높음',
  medium: '신뢰도 보통',
  low: '신뢰도 낮음',
};

const ACTION_LABELS = {
  candidate: '매수 검토 가능',
  watch_only: '관찰만',
  blocked: '매수 차단',
  reduce: '비중 축소 검토',
  avoid: '제외',
};

function getRiskProfile(item = {}) {
  return item.riskProfile || item.risk_profile || {};
}

function getRiskReview(item = {}) {
  return item.riskReview || item.risk_review || {};
}

function getLatestRecommendations(recommendations = [], limit = 5) {
  return [...recommendations]
    .filter(isBuyCandidateRecommendation)
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0))
    .slice(0, limit);
}

function getLatestBlockedRecommendations(recommendations = [], limit = 3) {
  return [...recommendations]
    .filter(item => !isBuyCandidateRecommendation(item))
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0))
    .slice(0, limit);
}

function isBuyCandidateRecommendation(item = {}) {
  const review = getRiskReview(item);
  const risk = getRiskProfile(item);
  const minRiskReward = risk.positionSize?.regimePolicy?.minRiskReward
    || risk.position_size?.regimePolicy?.minRiskReward
    || STRATEGY_POLICY.recommendationRules?.minRiskReward
    || 2;
  return review.approved === true
    && review.action === 'candidate'
    && typeof risk.riskReward === 'number'
    && risk.riskReward >= minRiskReward
    && typeof risk.entryReferencePrice === 'number'
    && typeof risk.stopLossPrice === 'number';
}

function labelValue(map, value, fallback = '미정') {
  return map[value] || fallback;
}

function formatPrice(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('ko-KR')
    : '';
}

function getLimiterLabel(positionSize = {}, suggestedAmount) {
  const limits = positionSize.limits || {};
  const entries = Object.entries(limits)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value));
  const matched = entries.find(([, value]) => value === suggestedAmount);
  const labels = {
    risk: '손실한도',
    new_buy_cap: '신규매수 한도',
    new_buy_amount_cap: '1회 신규매수 상한',
    ticker_limit: '종목비중 한도',
    sector_limit: '섹터비중 한도',
    cash: '현금',
  };
  return matched ? labels[matched[0]] || matched[0] : '';
}

function capSuggestedAmount(rawAmount) {
  if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount)) return null;
  const cap = STRATEGY_POLICY.capitalRules?.defaultMaxNewBuyAmountKrw;
  return typeof cap === 'number' && Number.isFinite(cap)
    ? Math.min(rawAmount, cap)
    : rawAmount;
}

function formatRiskReasons(review = {}, limit = 2) {
  const blockers = Array.isArray(review.blockers) ? review.blockers : [];
  const warnings = Array.isArray(review.warnings) ? review.warnings : [];
  const blockerReasons = blockers.map(humanizeRiskReason);
  const blockerSet = new Set(blockerReasons);
  const warningReasons = warnings.map(humanizeRiskReason).filter(reason => !blockerSet.has(reason));
  const reasons = [
    ...blockerReasons.map(item => `차단: ${item}`),
    ...warningReasons.map(item => `주의: ${item}`),
  ];
  return [...new Set(reasons)].slice(0, limit);
}

function humanizeRiskReason(reason = '') {
  const text = String(reason || '');
  const riskRewardMatch = text.match(/risk_reward:\s*([\d.]+):1\s*(?:<|\/)\s*(?:min\s*)?([\d.]+):1/i);
  if (riskRewardMatch) {
    return `손익비 부족: 기대수익이 예상손실의 ${riskRewardMatch[1]}배로, 최소 기준 ${riskRewardMatch[2]}배보다 낮음`;
  }

  if (/risk_reward/i.test(text)) {
    return `손익비 기준 미달: ${text}`;
  }
  if (/position_size:\s*no available amount/i.test(text)) {
    return '매수 가능 금액 없음: 현금, 종목 비중, 섹터 비중 또는 1회 한도에 걸림';
  }
  if (/position_size:\s*missing/i.test(text)) {
    return '제안 비중/금액 없음';
  }
  if (/identity_name_mismatch/i.test(text)) {
    return `종목명-티커 불일치: ${text.replace(/^schema_?identity_name_mismatch:\s*/i, '')}`;
  }
  if (/liquidity/i.test(text)) {
    return `유동성 기준 미달: ${text}`;
  }
  if (/stop_loss/i.test(text)) {
    return `손절 기준 문제: ${text}`;
  }
  if (/market_regime|regime/i.test(text)) {
    return `시장 국면 제한: ${text}`;
  }
  return text;
}

function formatRecommendationLine(item = {}) {
  const review = getRiskReview(item);
  const risk = getRiskProfile(item);
  const positionSize = risk.positionSize || risk.position_size || {};
  const isBuyCandidate = !review.action || review.action === 'candidate';
  const rawSuggestedAmount = typeof risk.suggestedAmount === 'number' ? risk.suggestedAmount : null;
  const suggestedAmount = capSuggestedAmount(rawSuggestedAmount);
  const entry = risk.entryReferencePrice ? `진입 ${formatPrice(Number(risk.entryReferencePrice))}` : '';
  const stop = risk.stopLossPrice ? `손절 ${formatPrice(Number(risk.stopLossPrice))}` : '';
  const limiter = rawSuggestedAmount !== null && suggestedAmount !== rawSuggestedAmount
    ? '1회 신규매수 상한'
    : getLimiterLabel(positionSize, suggestedAmount);
  const size = isBuyCandidate && suggestedAmount
    ? `제안 ${formatKRW(suggestedAmount)}${limiter ? ` (${limiter} 기준)` : ''}`
    : '매수 제안 없음';
  const label = [
    labelValue(SIGNAL_LABELS, item.signal, '방향 미정'),
    labelValue(CONVICTION_LABELS, item.conviction, '신뢰도 미정'),
    labelValue(ACTION_LABELS, review.action, '리스크 검토 미정'),
  ].filter(Boolean).join(' · ');
  const meta = [entry, stop, size].filter(Boolean).join(' · ');
  const reasons = formatRiskReasons(review);

  return [
    `▸ <b>${escapeHtml(item.name || item.ticker || item.symbol || 'unknown')}</b> ${escapeHtml(item.ticker || item.symbol || '')}`,
    `  ID: <code>${escapeHtml(item.id || '')}</code>`,
    `  ${escapeHtml(label)}`,
    `  ${escapeHtml(meta)}`,
    ...reasons.map(reason => `  ${escapeHtml(reason)}`),
  ].join('\n');
}

async function formatRecentRecommendations({ limit = 5, includeBlocked = false } = {}) {
  const recommendations = await loadRecommendations();
  return formatRecentRecommendationsFromList(recommendations, { limit, includeBlocked });
}

function formatRecentRecommendationsFromList(recommendations = [], { limit = 5, includeBlocked = false } = {}) {
  const latest = getLatestRecommendations(recommendations, limit);
  const blocked = includeBlocked ? getLatestBlockedRecommendations(recommendations, 3) : [];

  return [
    '<b>최근 매수 검토 후보</b>',
    latest.length > 0
      ? latest.map(formatRecommendationLine).join('\n\n')
      : '현재 리스크 기준을 통과한 매수 후보가 없습니다.',
    blocked.length > 0 ? '' : null,
    blocked.length > 0 ? '<b>최근 차단/관찰 후보</b>' : null,
    blocked.length > 0 ? blocked.map(formatRecommendationLine).join('\n\n') : null,
    '',
    '손익비가 낮거나 리스크 기준을 통과하지 못한 종목은 매수 추천으로 보지 않습니다.',
    includeBlocked ? null : '차단/관찰 후보 확인: /recommendations blocked',
    '매수 후보도 진입가, 손절가, 제안금액을 다시 확인하세요.',
    '거래 기록 연결 예: /buy 005930 3 70000 삼성전자 rec=추천ID',
  ].filter(line => line !== null).join('\n');
}

module.exports = {
  getLatestRecommendations,
  getLatestBlockedRecommendations,
  isBuyCandidateRecommendation,
  formatRecommendationLine,
  formatRecentRecommendations,
  formatRecentRecommendationsFromList,
  humanizeRiskReason,
};
