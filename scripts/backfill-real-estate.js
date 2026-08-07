#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parseRegionCodes } = require('../src/config/real-estate-regions');
const { collectRealEstate, recentDealMonths } = require('./collect-real-estate');

const DEFAULT_STATE_FILE = path.join(__dirname, '..', 'data', 'real-estate-backfill-state.json');

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const value = name => argv.find(item => item.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const monthCount = Math.max(13, Math.min(60, Number(value('months') || env.REAL_ESTATE_BACKFILL_MONTHS || 24)));
  return {
    dryRun: argv.includes('--dry-run'),
    reset: argv.includes('--reset'),
    months: recentDealMonths(new Date(), monthCount),
    regionCodes: parseRegionCodes(value('regions') || env.REAL_ESTATE_REGION_CODES),
    stateFile: value('state-file') || env.REAL_ESTATE_BACKFILL_STATE_FILE || DEFAULT_STATE_FILE,
    concurrency: Math.max(1, Math.min(8, Number(env.REAL_ESTATE_COLLECTION_CONCURRENCY || 4))),
  };
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { completedRegions: [] }; }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

async function backfillRealEstate(options = {}) {
  const state = options.reset ? { completedRegions: [] } : readState(options.stateFile);
  const completed = new Set(state.completedRegions || []);
  const summaries = [];
  for (const [index, lawdCode] of options.regionCodes.entries()) {
    if (completed.has(lawdCode)) continue;
    console.log(`[부동산백필] ${index + 1}/${options.regionCodes.length} 지역 ${lawdCode} 시작`);
    const result = await (options.collector || collectRealEstate)({
      dryRun: options.dryRun,
      regionCodes: [lawdCode],
      months: options.months,
      concurrency: options.concurrency,
    });
    summaries.push(result);
    if (!options.dryRun) {
      completed.add(lawdCode);
      writeState(options.stateFile, {
        months: options.months,
        completedRegions: [...completed],
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return {
    ok: true,
    dryRun: options.dryRun === true,
    requestedRegions: options.regionCodes.length,
    completedRegions: completed.size,
    processedNow: summaries.length,
    months: options.months,
  };
}

async function main() {
  const result = await backfillRealEstate(parseArgs());
  console.log(`[부동산백필] ${result.dryRun ? 'dry-run' : '완료'} · 이번 실행 ${result.processedNow}개 지역 · 누적 ${result.completedRegions}/${result.requestedRegions}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('[부동산백필] 실패:', error.message);
    process.exit(1);
  });
}

module.exports = { backfillRealEstate, parseArgs, readState, writeState };
