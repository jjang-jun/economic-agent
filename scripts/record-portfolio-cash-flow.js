const { recordPortfolioCashFlow } = require('../src/utils/portfolio-cash-flow');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = inlineValue ?? argv[++index];
    options[key] = value;
  }
  if (options.external !== undefined) options.external = String(options.external).toLowerCase() === 'true';
  return options;
}

async function main() {
  const flow = await recordPortfolioCashFlow(parseArgs());
  console.log(`[현금흐름] ${flow.type} ${flow.amount.toLocaleString('ko-KR')} ${flow.currency} 기록 완료 (${flow.id})`);
  console.log('[현금흐름] 포트폴리오 현금 잔액은 자동 변경하지 않습니다. 잔액 변경은 /cash 또는 포트폴리오 원본에서 별도로 확인하세요.');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[현금흐름] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = { parseArgs };
