const crypto = require('crypto');

function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function monthStart(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-01` : null;
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round((((current / previous) - 1) * 100) * 100) / 100;
}

function classifyMarket(metric, previous) {
  if (!previous || metric.transaction_count < 3) return 'INSUFFICIENT_SAMPLE';
  const price = metric.price_change_1m_pct;
  const volume = metric.transaction_change_1m_pct;
  if (price <= -3 && volume <= 0) return 'CORRECTION_CONTINUES';
  if (price <= 1 && volume >= 20) return 'TRANSACTION_RECOVERY_WATCH';
  if (price >= 3 && volume >= 20) return 'CHASE_RISK';
  if (Math.abs(price) <= 1.5 && volume > -20) return 'STABILIZING';
  return 'NEUTRAL';
}

function metricId(month, areaCode, minPrice, maxPrice) {
  return `real-estate-metric:${crypto.createHash('sha256')
    .update([month, areaCode, minPrice, maxPrice].join('|')).digest('hex').slice(0, 32)}`;
}

function buildAreaMetrics(trades = [], rents = [], options = {}) {
  const minPrice = Number(options.minPriceKrw || 0);
  const maxPrice = Number(options.maxPriceKrw || Number.MAX_SAFE_INTEGER);
  const groups = new Map();
  for (const trade of trades) {
    if (trade.price_krw < minPrice || trade.price_krw > maxPrice) continue;
    const month = monthStart(trade.contract_date);
    if (!month) continue;
    const key = `${trade.lawd_code}|${month}`;
    if (!groups.has(key)) groups.set(key, { trades: [], cancelled: 0, rents: [] });
    if (trade.cancelled) groups.get(key).cancelled += 1;
    else groups.get(key).trades.push(trade);
  }
  for (const rent of rents) {
    if (rent.rent_type !== 'jeonse') continue;
    const month = monthStart(rent.contract_date);
    const key = `${rent.lawd_code}|${month}`;
    if (groups.has(key)) groups.get(key).rents.push(rent);
  }

  const raw = [...groups.entries()].map(([key, group]) => {
    const [areaCode, month] = key.split('|');
    const prices = group.trades.map(item => Number(item.price_krw));
    const perSqm = group.trades
      .filter(item => Number(item.exclusive_area_sqm) > 0)
      .map(item => Number(item.price_krw) / Number(item.exclusive_area_sqm));
    const jeonseDeposits = group.rents.map(item => Number(item.deposit_krw)).filter(value => value > 0);
    const medianPrice = median(prices);
    const medianJeonse = median(jeonseDeposits);
    const sample = group.trades[0] || {};
    return {
      id: metricId(month, areaCode, minPrice, maxPrice),
      metric_month: month,
      area_code: areaCode,
      area_name: sample.district_name || areaCode,
      price_band_min_krw: minPrice,
      price_band_max_krw: maxPrice,
      transaction_count: prices.length,
      median_price_krw: Math.round(medianPrice),
      median_price_per_sqm_krw: Math.round(median(perSqm)),
      price_change_1m_pct: null,
      transaction_change_1m_pct: null,
      price_change_3m_pct: null,
      price_change_12m_pct: null,
      transaction_change_12m_pct: null,
      cancellation_ratio: Math.round((group.cancelled / Math.max(1, prices.length + group.cancelled)) * 10_000) / 100,
      jeonse_ratio: medianJeonse && medianPrice ? Math.round((medianJeonse / medianPrice) * 10_000) / 100 : null,
      source_cutoff_at: new Date().toISOString(),
      payload: { marketPhase: 'INSUFFICIENT_SAMPLE', jeonseSampleCount: jeonseDeposits.length },
      updated_at: new Date().toISOString(),
    };
  });

  const byArea = new Map();
  for (const item of raw) {
    if (!byArea.has(item.area_code)) byArea.set(item.area_code, []);
    byArea.get(item.area_code).push(item);
  }
  for (const items of byArea.values()) {
    items.sort((a, b) => a.metric_month.localeCompare(b.metric_month));
    for (let index = 0; index < items.length; index += 1) {
      const current = items[index];
      const previous = items[index - 1];
      const previous3m = items[index - 3];
      const previous12m = items[index - 12];
      const rolling24m = items.slice(Math.max(0, index - 23), index + 1);
      const rollingHigh24m = Math.max(...rolling24m.map(item => item.median_price_krw));
      current.price_change_1m_pct = previous
        ? pctChange(current.median_price_krw, previous.median_price_krw) : null;
      current.transaction_change_1m_pct = previous
        ? pctChange(current.transaction_count, previous.transaction_count) : null;
      current.price_change_3m_pct = previous3m
        ? pctChange(current.median_price_krw, previous3m.median_price_krw) : null;
      current.price_change_12m_pct = previous12m
        ? pctChange(current.median_price_krw, previous12m.median_price_krw) : null;
      current.transaction_change_12m_pct = previous12m
        ? pctChange(current.transaction_count, previous12m.transaction_count) : null;
      current.drawdown_from_24m_high_pct = pctChange(current.median_price_krw, rollingHigh24m);
      current.payload.rollingHigh24mKrw = rollingHigh24m;
      current.payload.marketPhase = classifyMarket(current, previous);
    }
  }
  return raw;
}

module.exports = { buildAreaMetrics, classifyMarket, median, monthStart, pctChange };
