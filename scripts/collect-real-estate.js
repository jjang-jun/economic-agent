#!/usr/bin/env node

const { loadRealEstateGoal } = require('../src/config/real-estate-goal');
const { buildTargetRangeScenarios } = require('../src/utils/housing-finance');
const { parseRegionCodes } = require('../src/config/real-estate-regions');
const { fetchMolitApartmentData } = require('../src/sources/molit-real-estate');
const { upsertRows } = require('../src/utils/persistence');
const { buildAreaMetrics } = require('../src/utils/real-estate-market');

function recentDealMonths(now = new Date(), count = 2) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(item => [item.type, item.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const value = name => argv.find(item => item.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  return {
    dryRun: argv.includes('--dry-run'),
    regionCodes: parseRegionCodes(value('regions') || env.REAL_ESTATE_REGION_CODES),
    months: value('months')
      ? value('months').split(',').map(item => item.trim()).filter(Boolean)
      : recentDealMonths(new Date(), Number(env.REAL_ESTATE_RESCAN_MONTHS || 2)),
    concurrency: Math.max(1, Math.min(8, Number(env.REAL_ESTATE_COLLECTION_CONCURRENCY || 4))),
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function collectRealEstate(options = {}) {
  const goal = options.goal || loadRealEstateGoal(options.env);
  const tasks = [];
  for (const lawdCode of options.regionCodes) {
    for (const dealYmd of options.months) {
      tasks.push({ lawdCode, dealYmd, kind: 'trade' }, { lawdCode, dealYmd, kind: 'rent' });
    }
  }
  const failures = [];
  const batches = await mapLimit(tasks, options.concurrency || 4, async task => {
    try {
      return { ...task, rows: await (options.fetcher || fetchMolitApartmentData)(task.kind, task) };
    } catch (error) {
      failures.push({ ...task, error: error.message });
      return { ...task, rows: [] };
    }
  });
  const trades = batches.filter(batch => batch.kind === 'trade').flatMap(batch => batch.rows)
    .filter(row => row.price_krw >= goal.monitorPriceRangeKrw.min && row.price_krw <= goal.monitorPriceRangeKrw.max);
  const rents = batches.filter(batch => batch.kind === 'rent').flatMap(batch => batch.rows);
  const metrics = buildAreaMetrics(trades, rents, {
    minPriceKrw: goal.monitorPriceRangeKrw.min,
    maxPriceKrw: goal.monitorPriceRangeKrw.max,
  });
  if (failures.length === tasks.length) throw new Error(`모든 부동산 공식 데이터 요청 실패 (${failures[0]?.error || 'unknown'})`);

  let saved = { trades: 0, rents: 0, metrics: 0 };
  if (!options.dryRun) {
    const tradeResult = await (options.upsert || upsertRows)('real_estate_transactions', trades, 'id');
    const rentResult = await (options.upsert || upsertRows)('real_estate_rent_transactions', rents, 'id');
    const metricResult = await (options.upsert || upsertRows)('real_estate_area_metrics', metrics, 'id');
    const goalResult = await (options.upsert || upsertRows)('real_estate_goals', [{
      id: goal.id,
      objective: goal.objective,
      target_start: goal.targetWindow.start,
      target_end: goal.targetWindow.end,
      monitor_price_min_krw: goal.monitorPriceRangeKrw.min,
      monitor_price_max_krw: goal.monitorPriceRangeKrw.max,
      target_price_min_krw: goal.targetPriceRangeKrw.min,
      target_price_max_krw: goal.targetPriceRangeKrw.max,
      desired_mortgage_krw: goal.financingAssumption.desiredMortgageKrw,
      assumptions: goal.financingAssumption,
      payload: goal,
      updated_at: new Date().toISOString(),
    }], 'id');
    const asOfDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const financeRows = buildTargetRangeScenarios({ goal }).map(scenario => ({
      id: `${goal.id}:${asOfDate}:${scenario.purchasePriceKrw}`,
      as_of_date: asOfDate,
      purchase_price_krw: scenario.purchasePriceKrw,
      estimated_loan_krw: scenario.estimatedLoanKrw,
      minimum_purchase_cash_krw: scenario.minimumPurchaseCashKrw,
      estimated_monthly_payment_krw: scenario.estimatedMonthlyPaymentKrw,
      dsr_verification_required: scenario.dsrVerificationRequired,
      assumptions: goal.financingAssumption,
      payload: scenario,
    }));
    const financeResult = await (options.upsert || upsertRows)('housing_finance_snapshots', financeRows, 'id');
    if (tradeResult.error || rentResult.error || metricResult.error || goalResult.error || financeResult.error) {
      throw tradeResult.error || rentResult.error || metricResult.error || goalResult.error || financeResult.error;
    }
    saved = {
      trades: tradeResult.saved || 0,
      rents: rentResult.saved || 0,
      metrics: metricResult.saved || 0,
      goals: goalResult.saved || 0,
      finance: financeResult.saved || 0,
    };
  }
  return {
    ok: true,
    dryRun: options.dryRun === true,
    requested: tasks.length,
    succeeded: tasks.length - failures.length,
    failures,
    tradeCount: trades.length,
    rentCount: rents.length,
    metricCount: metrics.length,
    saved,
    months: options.months,
    regionCount: options.regionCodes.length,
  };
}

async function main() {
  const options = parseArgs();
  const result = await collectRealEstate(options);
  console.log([
    `[부동산수집] ${result.dryRun ? 'dry-run' : '저장 완료'}`,
    `지역 ${result.regionCount}개 · 대상월 ${result.months.join(', ')}`,
    `공식 API ${result.succeeded}/${result.requested} 성공`,
    `5.8억~9.5억 매매 ${result.tradeCount}건 · 전월세 ${result.rentCount}건 · 지역월 지표 ${result.metricCount}건`,
    result.failures.length ? `부분 실패 ${result.failures.length}건 — 다음 실행에서 재조회` : '',
  ].filter(Boolean).join('\n'));
}

if (require.main === module) {
  main().catch(error => {
    console.error('[부동산수집] 실패:', error.message);
    process.exit(1);
  });
}

module.exports = {
  collectRealEstate,
  mapLimit,
  parseArgs,
  recentDealMonths,
};
