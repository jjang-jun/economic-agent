const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const USE_DIRECT_DATABASE_REST = Boolean(process.env.DATABASE_REST_URL);
const DATABASE_REST_URL = process.env.DATABASE_REST_URL
  || process.env.SUPABASE_URL
  || process.env.SUPABASE_PROJECT_URL;
const DATABASE_REST_KEY = USE_DIRECT_DATABASE_REST
  ? process.env.DATABASE_REST_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY;
const OUT_DIR = path.join(__dirname, '..', 'data', 'supabase');
const DB_FILE = path.join(__dirname, '..', 'data', 'economic-agent.db');
const DEFAULT_PAGE_SIZE = 1000;
const TABLE_ORDER_COLUMNS = Object.freeze({
  daily_summaries: 'date',
  source_cursors: 'source_name',
  job_locks: 'job_name',
});

const TABLES = [
  'articles',
  'daily_summaries',
  'stock_reports',
  'recommendations',
  'recommendation_evaluations',
  'research_candidates',
  'research_candidate_evaluations',
  'market_anomaly_signals',
  'trade_executions',
  'portfolio_cash_flows',
  'portfolio_snapshots',
  'performance_reviews',
  'market_snapshots',
  'price_snapshots',
  'price_provider_attempts',
  'investor_flows',
  'decision_contexts',
  'financial_freedom_goals',
  'portfolio_accounts',
  'positions',
  'risk_policy',
  'conversation_messages',
  'pending_actions',
  'collector_runs',
  'source_cursors',
  'alert_events',
  'job_locks',
  'policy_events',
  'policy_event_versions',
  'real_estate_goals',
  'real_estate_transactions',
  'real_estate_rent_transactions',
  'real_estate_listing_snapshots',
  'real_estate_area_metrics',
  'housing_finance_snapshots',
  'real_estate_market_indices',
];

function assertConfig() {
  if (!DATABASE_REST_URL || (!process.env.DATABASE_REST_URL && !DATABASE_REST_KEY)) {
    console.error('DATABASE_REST_URL or Supabase REST URL/key compatibility settings are required.');
    process.exit(1);
  }
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetryStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function buildHttpError(table, res) {
  const body = await res.text();
  const err = new Error(`${table}: ${res.status} ${body}`);
  err.status = res.status;
  err.body = body;
  return err;
}

async function fetchJsonWithRetry(table, url, options = {}) {
  const retries = parseNonNegativeInt(
    process.env.DATABASE_REST_RETRY_COUNT ?? process.env.SUPABASE_RETRY_COUNT,
    3,
  );
  const baseDelayMs = parseNonNegativeInt(
    process.env.DATABASE_REST_RETRY_DELAY_MS ?? process.env.SUPABASE_RETRY_DELAY_MS,
    1000,
  );
  const fetchFn = options.fetchFn || fetch;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchFn(url, options.requestOptions || {});
      if (res.ok) return res.json();

      const err = await buildHttpError(table, res);
      if (!shouldRetryStatus(err.status) || attempt >= retries) throw err;
      lastError = err;
    } catch (err) {
      if ((typeof err.status === 'number' && !shouldRetryStatus(err.status)) || attempt >= retries) {
        throw err;
      }
      lastError = err;
    }

    const delay = baseDelayMs * (2 ** attempt);
    console.warn(`[DB] ${table} pull retry ${attempt + 1}/${retries}: ${lastError.message}`);
    if (delay > 0) await sleep(delay);
  }

  throw lastError;
}

async function fetchTable(table, options = {}) {
  const pageSize = parseNonNegativeInt(
    options.pageSize ?? process.env.DATABASE_REST_PULL_PAGE_SIZE ?? process.env.SUPABASE_PULL_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
  );
  const baseUrl = options.databaseRestUrl || options.supabaseUrl || DATABASE_REST_URL;
  const directDatabaseRest = options.databaseRestUrl
    ? true
    : options.supabaseUrl
      ? false
      : USE_DIRECT_DATABASE_REST;
  const key = directDatabaseRest
    ? options.databaseRestKey ?? DATABASE_REST_KEY
    : options.supabaseKey || DATABASE_REST_KEY;
  const rows = [];
  let offset = 0;

  if (!pageSize) throw new Error('DATABASE_REST_PULL_PAGE_SIZE must be greater than 0');

  while (true) {
    const url = directDatabaseRest
      ? new URL(`${new URL(baseUrl).pathname.replace(/\/$/, '')}/${table}`.replace(/\/+/g, '/'), baseUrl)
      : new URL(`/rest/v1/${table}`, baseUrl);
    url.searchParams.set('select', '*');
    url.searchParams.set('order', `${TABLE_ORDER_COLUMNS[table] || 'id'}.asc`);
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('offset', String(offset));

    const page = await fetchJsonWithRetry(table, url, {
      fetchFn: options.fetchFn,
      requestOptions: {
        headers: key ? { apikey: key, Authorization: `Bearer ${key}` } : {},
      },
    });
    if (!Array.isArray(page)) {
      throw new Error(`${table}: expected array response`);
    }

    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function writeSqlite(table, rows) {
  const statements = [
    `create table if not exists ${table} (id text primary key, row_json text not null);`,
    'begin;',
    `delete from ${table};`,
  ];
  for (const row of rows) {
    const id = row.id || row.date || `${table}:${Math.random()}`;
    const json = JSON.stringify(row);
    statements.push(`insert or replace into ${table} (id, row_json) values (${sqlString(id)}, ${sqlString(json)});`);
  }
  statements.push('commit;');

  const result = spawnSync('sqlite3', [DB_FILE], {
    input: statements.join('\n'),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sqlite3 ${table}: ${result.stderr || `exit ${result.status}`}`);
  }
}

async function main() {
  assertConfig();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const table of TABLES) {
    const rows = await fetchTable(table);
    const file = path.join(OUT_DIR, `${table}.json`);
    fs.writeFileSync(file, JSON.stringify(rows, null, 2));
    writeSqlite(table, rows);
    console.log(`[DB] ${table}: ${rows.length} rows`);
  }

  console.log(`[DB] JSON sync: ${OUT_DIR}`);
  console.log(`[DB] SQLite mirror: ${DB_FILE}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[DB] pull failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  TABLES,
  TABLE_ORDER_COLUMNS,
  buildHttpError,
  fetchJsonWithRetry,
  fetchTable,
  parseNonNegativeInt,
  shouldRetryStatus,
};
