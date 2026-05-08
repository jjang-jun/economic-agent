const { selectRows } = require('./persistence');

const DOMESTIC_OFFICIAL_EOD_SOURCES = ['krx-openapi', 'data-go-kr'];
const DOMESTIC_EOD_FALLBACK_SOURCES = ['kis-rest'];
const FALLBACK_SOURCES = ['naver-finance', 'yahoo-finance'];

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function startIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function countBy(items, getKey) {
  return (items || []).reduce((acc, item) => {
    const key = getKey(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function latestIso(values = []) {
  const times = values
    .map(value => new Date(value || '').getTime())
    .filter(Number.isFinite);
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

function uniqueCount(items, getKey) {
  return new Set((items || []).map(getKey).filter(Boolean)).size;
}

function isStaleSnapshot(row, now = new Date()) {
  const asOf = new Date(row.as_of || '').getTime();
  if (!Number.isFinite(asOf)) return true;
  const ageHours = (now.getTime() - asOf) / 3600000;
  if (row.price_type === 'current') return ageHours > 36;
  if (row.price_type === 'eod') return ageHours > 24 * 10;
  return ageHours > 24 * 10;
}

function summarizePriceSourceQuality(rows = [], options = {}) {
  const now = options.now || new Date();
  const bySource = countBy(rows, row => row.source);
  const byPriceType = countBy(rows, row => row.price_type);
  const eodRows = rows.filter(row => row.price_type === 'eod');
  const currentRows = rows.filter(row => row.price_type === 'current');
  const officialEodRows = eodRows.filter(row => DOMESTIC_OFFICIAL_EOD_SOURCES.includes(row.source));
  const kisEodRows = eodRows.filter(row => DOMESTIC_EOD_FALLBACK_SOURCES.includes(row.source));
  const fallbackRows = rows.filter(row => FALLBACK_SOURCES.includes(row.source));
  const staleRows = rows.filter(row => isStaleSnapshot(row, now));
  const sourceRows = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([source, count]) => {
      const sourceItems = rows.filter(row => row.source === source);
      return {
        source,
        count,
        tickerCount: uniqueCount(sourceItems, row => row.ticker),
        latestAsOf: latestIso(sourceItems.map(row => row.as_of)),
      };
    });

  const fallbackRatePct = rows.length ? round((fallbackRows.length / rows.length) * 100) : null;
  const officialEodRatePct = eodRows.length ? round((officialEodRows.length / eodRows.length) * 100) : null;
  const healthLabel = (() => {
    if (rows.length === 0) return 'empty';
    if (fallbackRatePct !== null && fallbackRatePct > 50) return 'warn';
    if (eodRows.length > 0 && officialEodRatePct !== null && officialEodRatePct < 50) return 'warn';
    if (staleRows.length > Math.max(3, rows.length * 0.2)) return 'warn';
    return 'ok';
  })();

  return {
    totalSnapshots: rows.length,
    tickerCount: uniqueCount(rows, row => row.ticker),
    currentSnapshots: currentRows.length,
    eodSnapshots: eodRows.length,
    bySource,
    byPriceType,
    officialEod: {
      total: officialEodRows.length,
      krx: bySource['krx-openapi'] || 0,
      dataGoKr: bySource['data-go-kr'] || 0,
      ratePct: officialEodRatePct,
    },
    kisEodFallback: kisEodRows.length,
    fallback: {
      total: fallbackRows.length,
      ratePct: fallbackRatePct,
      naver: bySource['naver-finance'] || 0,
      yahoo: bySource['yahoo-finance'] || 0,
    },
    staleSnapshots: staleRows.length,
    latestAsOf: latestIso(rows.map(row => row.as_of)),
    sourceRows,
    healthLabel,
  };
}

async function buildPriceSourceQualitySummary({ days = 7 } = {}) {
  const since = startIso(days);
  const result = await selectRows('price_snapshots', {
    select: 'ticker,source,price_type,as_of,collected_at',
    collected_at: `gte.${since}`,
    order: 'collected_at.desc',
    limit: '2000',
  });
  return summarizePriceSourceQuality(result.rows || []);
}

module.exports = {
  summarizePriceSourceQuality,
  buildPriceSourceQualitySummary,
};
