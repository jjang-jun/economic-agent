#!/usr/bin/env node

const { fetchDomesticDailyOhlcv, isDomesticTicker } = require('../src/sources/price-provider');

function usage() {
  console.error('Usage: npm run prices:backfill-eod -- <tickers> <from> <to>');
  console.error('Example: npm run prices:backfill-eod -- 005930,000660 2026-05-01 2026-05-07');
}

function parseTickers(value) {
  return String(value || '')
    .split(',')
    .map(ticker => ticker.trim())
    .filter(Boolean);
}

async function main() {
  const [tickersArg, from, to = from] = process.argv.slice(2);
  const tickers = parseTickers(tickersArg);

  if (tickers.length === 0 || !from) {
    usage();
    process.exit(1);
  }

  let total = 0;
  for (const ticker of tickers) {
    if (!isDomesticTicker(ticker)) {
      console.warn(`[skip] ${ticker}: 국내 6자리 종목코드가 아닙니다.`);
      continue;
    }

    const rows = await fetchDomesticDailyOhlcv(ticker, from, to);
    total += rows.length;
    const source = rows[0]?.source || 'none';
    console.log(`[eod] ${ticker}: ${rows.length} rows (${source})`);
  }

  console.log(`[done] persisted ${total} EOD price rows`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
