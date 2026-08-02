function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function timestamp(item, keys) {
  const value = keys.map(key => item?.[key]).find(Boolean);
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeSnapshots(rows = []) {
  const byTime = new Map();
  for (const row of rows) {
    const capturedAt = row.captured_at || row.capturedAt || row.payload?.capturedAt || '';
    const totalAssetValue = Number(row.total_asset_value ?? row.totalAssetValue ?? row.payload?.totalAssetValue);
    const time = new Date(capturedAt).getTime();
    if (!Number.isFinite(time) || !Number.isFinite(totalAssetValue) || totalAssetValue <= 0) continue;
    byTime.set(time, { capturedAt, totalAssetValue });
  }
  return [...byTime.values()].sort((a, b) => timestamp(a, ['capturedAt']) - timestamp(b, ['capturedAt']));
}

function externalAmount(flow) {
  if (flow?.external !== true && !['deposit', 'withdrawal'].includes(flow?.type)) return 0;
  const value = Number(flow.externalAmount ?? flow.external_amount ?? flow.amount);
  return Number.isFinite(value) ? value : 0;
}

function calculateTimeWeightedReturn(snapshots = [], cashFlows = []) {
  const rows = normalizeSnapshots(snapshots);
  if (rows.length < 2) return null;
  let growth = 1;
  let periods = 0;
  for (let index = 1; index < rows.length; index++) {
    const start = rows[index - 1];
    const end = rows[index];
    const startTime = timestamp(start, ['capturedAt']);
    const endTime = timestamp(end, ['capturedAt']);
    const flow = cashFlows.reduce((sum, item) => {
      const time = timestamp(item, ['occurredAt', 'occurred_at']);
      return time > startTime && time <= endTime ? sum + externalAmount(item) : sum;
    }, 0);
    const periodReturn = (end.totalAssetValue - flow) / start.totalAssetValue - 1;
    if (!Number.isFinite(periodReturn) || periodReturn <= -1) continue;
    growth *= 1 + periodReturn;
    periods++;
  }
  return periods ? round((growth - 1) * 100, 4) : null;
}

function xnpv(rate, flows) {
  const firstTime = flows[0].time;
  return flows.reduce((sum, flow) => {
    const years = (flow.time - firstTime) / (365.25 * 86400000);
    return sum + flow.amount / ((1 + rate) ** years);
  }, 0);
}

function calculateXirr(flows = []) {
  const valid = flows
    .map(flow => ({ time: timestamp(flow, ['occurredAt', 'occurred_at']), amount: Number(flow.amount) }))
    .filter(flow => flow.time > 0 && Number.isFinite(flow.amount) && flow.amount !== 0)
    .sort((a, b) => a.time - b.time);
  if (valid.length < 2 || !valid.some(flow => flow.amount < 0) || !valid.some(flow => flow.amount > 0)) return null;
  const rates = [-0.999999999999, -0.999999, -0.9999, -0.9, -0.5, 0, 0.1, 0.5, 1, 2, 5, 10, 100, 1000];
  let lower = null;
  let upper = null;
  for (let index = 1; index < rates.length; index++) {
    const left = xnpv(rates[index - 1], valid);
    const right = xnpv(rates[index], valid);
    if (left === 0) return rates[index - 1];
    if (left * right <= 0) {
      lower = rates[index - 1];
      upper = rates[index];
      break;
    }
  }
  if (lower === null) return null;
  for (let iteration = 0; iteration < 200; iteration++) {
    const mid = (lower + upper) / 2;
    const leftValue = xnpv(lower, valid);
    const midValue = xnpv(mid, valid);
    if (Math.abs(midValue) < 1e-7) return mid;
    if (leftValue * midValue <= 0) upper = mid;
    else lower = mid;
  }
  return (lower + upper) / 2;
}

function calculateMoneyWeightedReturn(snapshots = [], cashFlows = []) {
  const rows = normalizeSnapshots(snapshots);
  if (rows.length < 2) return null;
  const start = rows[0];
  const end = rows.at(-1);
  const startTime = timestamp(start, ['capturedAt']);
  const endTime = timestamp(end, ['capturedAt']);
  const investorFlows = [{ occurredAt: start.capturedAt, amount: -start.totalAssetValue }];
  for (const flow of cashFlows) {
    const time = timestamp(flow, ['occurredAt', 'occurred_at']);
    const amount = externalAmount(flow);
    if (time > startTime && time <= endTime && amount !== 0) {
      investorFlows.push({ occurredAt: new Date(time).toISOString(), amount: -amount });
    }
  }
  investorFlows.push({ occurredAt: end.capturedAt, amount: end.totalAssetValue });
  const rate = calculateXirr(investorFlows);
  return rate === null ? null : round(rate * 100, 4);
}

function calculateBenchmarkReturn(rows = []) {
  const valid = rows
    .map(row => ({
      time: timestamp(row, ['as_of', 'asOf', 'market_time', 'marketTime']),
      price: Number(row.price),
    }))
    .filter(row => row.time > 0 && Number.isFinite(row.price) && row.price > 0)
    .sort((a, b) => a.time - b.time);
  if (valid.length < 2) return null;
  return round(((valid.at(-1).price / valid[0].price) - 1) * 100, 4);
}

function buildPortfolioReturnMetrics({ snapshots = [], cashFlows = [], benchmarkSnapshots = [] } = {}) {
  const rows = normalizeSnapshots(snapshots);
  const externalFlows = cashFlows.filter(flow => externalAmount(flow) !== 0);
  const netExternalFlow = externalFlows.reduce((sum, flow) => sum + externalAmount(flow), 0);
  const twrPct = calculateTimeWeightedReturn(rows, externalFlows);
  const moneyWeightedAnnualizedPct = calculateMoneyWeightedReturn(rows, externalFlows);
  const startTime = timestamp(rows[0], ['capturedAt']);
  const endTime = timestamp(rows.at(-1), ['capturedAt']);
  const benchmarkWindow = benchmarkSnapshots.filter(item => {
    const time = timestamp(item, ['as_of', 'asOf', 'market_time', 'marketTime']);
    return time >= startTime && time <= endTime;
  });
  const benchmarkReturnPct = calculateBenchmarkReturn(benchmarkWindow);
  return {
    dataAvailable: rows.length >= 2,
    method: 'daily_snapshot_twr',
    snapshotCount: rows.length,
    externalFlowCount: externalFlows.length,
    netExternalFlow,
    twrPct,
    moneyWeightedAnnualizedPct,
    benchmarkSymbol: '^KS11',
    benchmarkReturnPct,
    excessReturnPct: typeof twrPct === 'number' && typeof benchmarkReturnPct === 'number'
      ? round(twrPct - benchmarkReturnPct, 4)
      : null,
  };
}

module.exports = {
  normalizeSnapshots,
  externalAmount,
  calculateTimeWeightedReturn,
  calculateXirr,
  calculateMoneyWeightedReturn,
  calculateBenchmarkReturn,
  buildPortfolioReturnMetrics,
};
