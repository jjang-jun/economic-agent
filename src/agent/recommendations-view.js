const { loadRecommendations } = require('../utils/recommendation-log');
const { formatKRW } = require('../utils/decision-engine');
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

function getLatestRecommendations(recommendations = [], limit = 5) {
  return [...recommendations]
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0))
    .slice(0, limit);
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

function formatRiskReasons(review = {}, limit = 2) {
  const blockers = Array.isArray(review.blockers) ? review.blockers : [];
  const warnings = Array.isArray(review.warnings) ? review.warnings : [];
  return [
    ...blockers.map(item => `차단: ${item}`),
    ...warnings.map(item => `주의: ${item}`),
  ].slice(0, limit);
}

function formatRecommendationLine(item = {}) {
  const review = item.riskReview || item.risk_review || {};
  const risk = item.riskProfile || item.risk_profile || {};
  const positionSize = risk.positionSize || risk.position_size || {};
  const suggestedAmount = typeof risk.suggestedAmount === 'number' ? risk.suggestedAmount : null;
  const entry = risk.entryReferencePrice ? `진입 ${formatPrice(Number(risk.entryReferencePrice))}` : '';
  const stop = risk.stopLossPrice ? `손절 ${formatPrice(Number(risk.stopLossPrice))}` : '';
  const limiter = getLimiterLabel(positionSize, suggestedAmount);
  const size = suggestedAmount ? `제안 ${formatKRW(suggestedAmount)}${limiter ? ` (${limiter} 기준)` : ''}` : '제안금액 없음';
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

async function formatRecentRecommendations({ limit = 5 } = {}) {
  const recommendations = await loadRecommendations();
  const latest = getLatestRecommendations(recommendations, limit);

  return [
    '<b>최근 추천</b>',
    latest.length > 0
      ? latest.map(formatRecommendationLine).join('\n')
      : '최근 추천이 없습니다.',
    '',
    '관찰만/매수 차단은 바로 사라는 뜻이 아닙니다. 매수 후보도 진입가, 손절가, 제안금액을 다시 확인하세요.',
    '거래 기록 연결 예: /buy 005930 3 70000 삼성전자 rec=추천ID',
  ].join('\n');
}

module.exports = {
  getLatestRecommendations,
  formatRecommendationLine,
  formatRecentRecommendations,
};
