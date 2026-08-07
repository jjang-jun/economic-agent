#!/usr/bin/env node

const { loadRealEstateGoal } = require('../src/config/real-estate-goal');
const { fetchAuthorizedListingFeed } = require('../src/sources/real-estate-listing-feed');
const { upsertRows } = require('../src/utils/persistence');

async function collectListings(options = {}) {
  const goal = options.goal || loadRealEstateGoal(options.env);
  const rows = await (options.fetcher || fetchAuthorizedListingFeed)(options);
  const filtered = rows.filter(row => (
    row.asking_price_krw >= goal.monitorPriceRangeKrw.min
    && row.asking_price_krw <= goal.monitorPriceRangeKrw.max
  ));
  if (options.dryRun) return { ok: true, dryRun: true, received: rows.length, saved: 0, rows: filtered };
  const result = await (options.upsert || upsertRows)('real_estate_listing_snapshots', filtered, 'id');
  if (result.error) throw result.error;
  return { ok: true, dryRun: false, received: rows.length, saved: result.saved || 0, rows: filtered };
}

async function main() {
  const result = await collectListings({ dryRun: process.argv.includes('--dry-run') });
  console.log(`[호가수집] ${result.dryRun ? 'dry-run' : '저장 완료'} · 수신 ${result.received}건 · 목표 가격대 ${result.rows.length}건`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('[호가수집] 실패:', error.message);
    process.exit(1);
  });
}

module.exports = { collectListings };
