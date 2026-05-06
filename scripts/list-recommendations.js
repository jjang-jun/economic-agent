const { loadRecommendations } = require('../src/utils/recommendation-log');

async function main() {
  const limit = Number(process.argv[2] || 10);
  const recommendations = await loadRecommendations();
  const latest = [...recommendations]
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0))
    .slice(0, Number.isFinite(limit) ? limit : 10);

  for (const item of latest) {
    const review = item.riskReview || item.risk_review || {};
    const risk = item.riskProfile || item.risk_profile || {};
    const size = risk.suggestedAmount ? `${Math.round(risk.suggestedAmount).toLocaleString('ko-KR')}원` : 'n/a';
    console.log([
      item.id,
      `${item.name || item.ticker} ${item.ticker || ''}`.trim(),
      `signal=${item.signal}`,
      `conviction=${item.conviction}`,
      `action=${review.action || 'n/a'}`,
      `size=${size}`,
    ].join(' | '));
  }
}

main().catch(err => {
  console.error('[추천목록] 실패:', err.message);
  process.exit(1);
});
