const crypto = require('crypto');

const DEFAULT_STATBL_ID = 'A_2024_00045';
const DEFAULT_ENDPOINT = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';

function responseRows(payload = {}) {
  const sections = payload.SttsApiTblData;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap(section => Array.isArray(section.row) ? section.row : []);
}

function responseTotal(payload = {}) {
  const sections = payload.SttsApiTblData;
  const head = Array.isArray(sections) ? sections.flatMap(section => section.head || []) : [];
  return Number(head.find(item => item.list_total_count !== undefined)?.list_total_count || 0);
}

function assertRebResponse(payload = {}) {
  if (payload.RESULT?.CODE === 'INFO-200') return false;
  if (payload.RESULT && payload.RESULT.CODE !== 'INFO-000') {
    throw new Error(`R-ONE ${payload.RESULT.CODE}: ${payload.RESULT.MESSAGE || 'unknown error'}`);
  }
  const sections = payload.SttsApiTblData;
  const head = Array.isArray(sections) ? sections.flatMap(section => section.head || []) : [];
  const result = head.find(item => item.RESULT)?.RESULT;
  if (result && result.CODE !== 'INFO-000') {
    throw new Error(`R-ONE ${result.CODE}: ${result.MESSAGE || 'unknown error'}`);
  }
  if (!Array.isArray(sections)) throw new Error('R-ONE returned an invalid response');
  return true;
}

function normalizeRebIndex(row = {}, observedAt = new Date().toISOString()) {
  const period = String(row.WRTTIME_IDTFR_ID || '');
  const areaId = String(row.CLS_ID || '');
  const value = Number(row.DTA_VAL);
  if (!/^\d{6}$/.test(period) || !areaId || !Number.isFinite(value)) return null;
  const areaPath = String(row.CLS_FULLNM || row.CLS_NM || '');
  if (!/^(서울|경기)(>|$)/.test(areaPath)) return null;
  return {
    id: `reb-index:${crypto.createHash('sha256').update([row.STATBL_ID, period, areaId].join('|')).digest('hex').slice(0, 32)}`,
    source: 'reb_r_one',
    statbl_id: String(row.STATBL_ID || DEFAULT_STATBL_ID),
    period: `${period.slice(0, 4)}-${period.slice(4, 6)}-01`,
    area_id: areaId,
    area_name: String(row.CLS_NM || areaPath),
    area_path: areaPath,
    index_value: value,
    change_1m_pct: null,
    change_3m_pct: null,
    change_12m_pct: null,
    drawdown_from_24m_high_pct: null,
    observed_at: observedAt,
    payload: row,
  };
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round((((current / previous) - 1) * 100) * 100) / 100;
}

function offsetPeriod(period, monthsBack) {
  const match = String(period || '').match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 - monthsBack, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function enrichRebIndexChanges(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.area_id)) groups.set(row.area_id, []);
    groups.get(row.area_id).push(row);
  }
  for (const items of groups.values()) {
    items.sort((a, b) => a.period.localeCompare(b.period));
    const byPeriod = new Map(items.map(item => [item.period, item]));
    items.forEach((current, index) => {
      current.change_1m_pct = pctChange(current.index_value, byPeriod.get(offsetPeriod(current.period, 1))?.index_value);
      current.change_3m_pct = pctChange(current.index_value, byPeriod.get(offsetPeriod(current.period, 3))?.index_value);
      current.change_12m_pct = pctChange(current.index_value, byPeriod.get(offsetPeriod(current.period, 12))?.index_value);
      const high = Math.max(...items.slice(Math.max(0, index - 23), index + 1).map(item => item.index_value));
      current.drawdown_from_24m_high_pct = pctChange(current.index_value, high);
    });
  }
  return rows;
}

async function fetchRebMonth(month, options = {}) {
  const key = options.key || process.env.REB_OPEN_API_KEY;
  if (!key) throw new Error('REB_OPEN_API_KEY is required for R-ONE collection');
  if (!/^\d{6}$/.test(String(month))) throw new Error(`Invalid R-ONE month: ${month}`);
  const pageSize = Math.max(1, Math.min(1000, Number(options.pageSize || 1000)));
  const fetcher = options.fetcher || fetch;
  const observedAt = new Date(options.now || Date.now()).toISOString();
  const all = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (all.length < total) {
    const url = new URL(options.endpoint || DEFAULT_ENDPOINT);
    url.searchParams.set('KEY', key);
    url.searchParams.set('Type', 'json');
    url.searchParams.set('pIndex', String(page));
    url.searchParams.set('pSize', String(pageSize));
    url.searchParams.set('STATBL_ID', options.statblId || DEFAULT_STATBL_ID);
    url.searchParams.set('DTACYCLE_CD', 'MM');
    url.searchParams.set('WRTTIME_IDTFR_ID', String(month));
    const response = await fetcher(url, { signal: AbortSignal.timeout(Number(options.timeoutMs || 20_000)) });
    if (!response.ok) throw new Error(`R-ONE request failed: ${response.status}`);
    const payload = await response.json();
    if (!assertRebResponse(payload)) break;
    const rows = responseRows(payload);
    total = responseTotal(payload);
    all.push(...rows);
    if (rows.length === 0 || all.length >= total) break;
    page += 1;
  }
  return all.map(row => normalizeRebIndex(row, observedAt)).filter(Boolean);
}

async function fetchRebIndexHistory(months = [], options = {}) {
  const rows = [];
  for (const month of months) rows.push(...await fetchRebMonth(month, options));
  return enrichRebIndexChanges(rows);
}

module.exports = {
  DEFAULT_ENDPOINT,
  DEFAULT_STATBL_ID,
  assertRebResponse,
  enrichRebIndexChanges,
  fetchRebIndexHistory,
  fetchRebMonth,
  normalizeRebIndex,
  offsetPeriod,
  responseRows,
  responseTotal,
};
