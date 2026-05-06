const { recordTradeExecution } = require('../src/utils/trade-log');

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: npm run trade:record -- --side buy --ticker 005930 --name 삼성전자 --quantity 3 --price 266000 --notes "1차 진입"');
    return;
  }

  const trade = await recordTradeExecution({
    side: args.side,
    ticker: args.ticker,
    symbol: args.symbol,
    name: args.name,
    quantity: args.quantity,
    price: args.price,
    fees: args.fees,
    taxes: args.taxes,
    recommendationId: args.recommendationId,
    notes: args.notes,
    date: args.date,
    executedAt: args.executedAt,
    updatePortfolio: !args.noPortfolio,
  });

  console.log(`[거래기록] ${trade.side} ${trade.name || trade.ticker || trade.symbol} ${trade.quantity}주 @ ${trade.price.toLocaleString('ko-KR')}`);
  if (!args.noPortfolio) {
    console.log('[거래기록] portfolio.json 갱신 완료');
  }
  console.log(`[거래기록] id=${trade.id}`);
}

main().catch(err => {
  console.error('[거래기록] 실패:', err.message);
  process.exit(1);
});
