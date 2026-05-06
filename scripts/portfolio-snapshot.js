const { loadPortfolio, enrichPortfolio, savePortfolioSnapshot } = require('../src/utils/portfolio');
const { persistPortfolioSnapshot } = require('../src/utils/persistence');

function formatKRW(value) {
  if (typeof value !== 'number') return '';
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

async function main() {
  const snapshot = await enrichPortfolio(loadPortfolio());
  const file = savePortfolioSnapshot(snapshot);
  await persistPortfolioSnapshot(snapshot);

  console.log(`[포트폴리오] 총자산 ${formatKRW(snapshot.totalAssetValue)}, 현금 ${formatKRW(snapshot.cashAmount)}, 평가손익 ${formatKRW(snapshot.unrealizedPnl)} (${snapshot.unrealizedPnlPct ?? 0}%)`);
  console.log(`[포트폴리오] 스냅샷: ${file}`);
}

main().catch(err => {
  console.error('[포트폴리오] 스냅샷 실패:', err.message);
  process.exit(1);
});
