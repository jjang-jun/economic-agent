const { loadPortfolio } = require('../src/utils/portfolio');
const { buildFreedomStatus, saveFreedomStatus } = require('../src/utils/freedom-engine');

function formatKRW(value) {
  if (typeof value !== 'number') return 'n/a';
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatMonths(months) {
  if (months === null || months === undefined) return 'n/a';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years}년 ${rest}개월`;
}

function main() {
  const portfolio = loadPortfolio();
  const status = buildFreedomStatus({ portfolio });
  const file = saveFreedomStatus(status);

  console.log(`[Freedom] 저장: ${file}`);
  console.log(`[Freedom] 목표 순자산: ${formatKRW(status.goal.targetNetWorth)}`);
  console.log(`[Freedom] 현재 순자산: ${formatKRW(status.currentNetWorth)} (${status.targetProgressPct}%)`);
  console.log(`[Freedom] 예상 달성: ${status.estimatedTargetDate || 'n/a'} (${formatMonths(status.monthsToTarget)})`);
  console.log(`[Freedom] 목표일 필요 연수익률: ${status.requiredAnnualReturnPct ?? 'n/a'}%`);
  console.log(`[Freedom] ${status.stress.drawdownPct}% 하락 시 지연: ${formatMonths(status.stress.delayMonths)}`);
}

main();
