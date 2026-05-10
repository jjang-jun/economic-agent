const { upsertTradePlan, loadTradePlans, loadOpenTradePlans } = require('../src/utils/trade-plan');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function printPlan(plan) {
  const side = plan.side === 'sell' ? '매도' : '매수';
  const target = plan.targetRemainingQuantity !== null && plan.targetRemainingQuantity !== undefined
    ? `, 목표 잔여 ${plan.targetRemainingQuantity}주`
    : '';
  console.log(`[매매계획] ${plan.status} ${plan.plannedDate} ${side} ${plan.name || plan.ticker || plan.symbol} ${plan.quantity}주${target}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: npm run trade:plan -- --side sell --ticker DRAM --name "DRAM ETF" --quantity 30 --plannedDate 2026-05-11 --targetRemainingQuantity 170');
    console.log('       npm run trade:plan -- --list');
    return;
  }

  if (args.list) {
    const rows = args.all ? loadTradePlans() : loadOpenTradePlans({ includeFuture: true });
    if (rows.length === 0) {
      console.log('[매매계획] 없음');
      return;
    }
    rows.forEach(printPlan);
    return;
  }

  const plan = upsertTradePlan({
    side: args.side,
    ticker: args.ticker,
    symbol: args.symbol,
    name: args.name,
    quantity: args.quantity,
    plannedDate: args.plannedDate || args.date,
    targetRemainingQuantity: args.targetRemainingQuantity,
    notes: args.notes,
  });
  printPlan(plan);
}

main().catch(err => {
  console.error('[매매계획] 실패:', err.message);
  process.exit(1);
});
