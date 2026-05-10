const { loadPortfolio, enrichPortfolio, loadLatestPortfolioSnapshot } = require('../src/utils/portfolio');
const { buildFreedomStatus, saveFreedomStatus } = require('../src/utils/freedom-engine');
const { persistFinancialFreedomGoal } = require('../src/utils/persistence');
const { sendFreedomStatus, formatFreedomStatus } = require('../src/notify/telegram');

function parseArgs(argv = process.argv.slice(2)) {
  return {
    telegram: argv.includes('--telegram'),
    noPersist: argv.includes('--noPersist') || argv.includes('--no-persist'),
    noSave: argv.includes('--noSave') || argv.includes('--no-save'),
  };
}

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

async function main(options = parseArgs()) {
  const enriched = await enrichPortfolio(loadPortfolio());
  const missingMarketValues = (enriched.positions || []).some(position => (
    typeof position.quantity === 'number' && typeof position.marketValue !== 'number'
  ));
  const latestSnapshot = loadLatestPortfolioSnapshot();
  const portfolio = missingMarketValues && latestSnapshot?.totalAssetValue
    ? latestSnapshot
    : enriched;
  const status = buildFreedomStatus({ portfolio });
  const file = options.noSave ? null : saveFreedomStatus(status);
  if (!options.noPersist) await persistFinancialFreedomGoal(status);

  if (options.telegram) await sendFreedomStatus(status);
  else console.log(formatFreedomStatus(status));

  console.log(`[Freedom] 저장: ${file || 'skip'}`);
  console.log(`[Freedom] 목표 순자산: ${formatKRW(status.goal.targetNetWorth)}`);
  console.log(`[Freedom] 현재 순자산: ${formatKRW(status.currentNetWorth)} (${status.targetProgressPct}%)`);
  console.log(`[Freedom] 예상 달성: ${status.estimatedTargetDate || 'n/a'} (${formatMonths(status.monthsToTarget)})`);
  console.log(`[Freedom] 목표일 필요 연수익률: ${status.requiredAnnualReturnPct ?? 'n/a'}%`);
  console.log(`[Freedom] ${status.stress.drawdownPct}% 하락 시 지연: ${formatMonths(status.stress.delayMonths)}`);
  return status;
}

if (require.main === module) {
  main().catch(err => {
    console.error('[Freedom] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  main,
};
