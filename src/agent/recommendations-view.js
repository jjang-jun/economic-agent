const { loadRecommendations } = require('../utils/recommendation-log');
const { formatKRW } = require('../utils/decision-engine');
const { escapeHtml } = require('./response-composer');

function getLatestRecommendations(recommendations = [], limit = 5) {
  return [...recommendations]
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0))
    .slice(0, limit);
}

function formatRecommendationLine(item = {}) {
  const review = item.riskReview || item.risk_review || {};
  const risk = item.riskProfile || item.risk_profile || {};
  const entry = risk.entryReferencePrice ? `진입 ${Number(risk.entryReferencePrice).toLocaleString('ko-KR')}` : '';
  const stop = risk.stopLossPrice ? `손절 ${Number(risk.stopLossPrice).toLocaleString('ko-KR')}` : '';
  const size = risk.suggestedAmount ? `제안 ${formatKRW(risk.suggestedAmount)}` : '';
  const action = review.action || 'n/a';
  const label = [item.signal || 'neutral', item.conviction || 'low', action].filter(Boolean).join('/');
  const meta = [entry, stop, size].filter(Boolean).join(' · ');

  return [
    `▸ <b>${escapeHtml(item.name || item.ticker || item.symbol || 'unknown')}</b> ${escapeHtml(item.ticker || item.symbol || '')}`,
    `  ID: <code>${escapeHtml(item.id || '')}</code>`,
    `  ${escapeHtml(label)}${meta ? ` · ${escapeHtml(meta)}` : ''}`,
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
    '거래 기록 연결 예: /buy 005930 3 70000 삼성전자 rec=추천ID',
  ].join('\n');
}

module.exports = {
  getLatestRecommendations,
  formatRecommendationLine,
  formatRecentRecommendations,
};
