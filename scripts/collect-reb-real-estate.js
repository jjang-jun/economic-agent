#!/usr/bin/env node

const { recentDealMonths } = require('./collect-real-estate');
const { fetchRebIndexHistory } = require('../src/sources/reb-real-estate');
const { upsertRows } = require('../src/utils/persistence');

async function collectRebRealEstate(options = {}) {
  const months = options.months || recentDealMonths(new Date(), Number(options.monthCount || 24));
  const rows = await (options.fetcher || fetchRebIndexHistory)(months, options);
  if (options.dryRun) return { ok: true, dryRun: true, months, rows, saved: 0 };
  const result = await (options.upsert || upsertRows)('real_estate_market_indices', rows, 'id');
  if (result.error) throw result.error;
  return { ok: true, dryRun: false, months, rows, saved: result.saved || 0 };
}

async function main() {
  const result = await collectRebRealEstate({ dryRun: process.argv.includes('--dry-run') });
  console.log(`[R-ONE] ${result.dryRun ? 'dry-run' : '저장 완료'} · ${result.months.length}개월 · 서울/경기 지수 ${result.rows.length}건`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('[R-ONE] 실패:', error.message);
    process.exit(1);
  });
}

module.exports = { collectRebRealEstate };
