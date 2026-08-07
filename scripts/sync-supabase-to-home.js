const { TABLES, fetchTable } = require('./pull-supabase');

const SYNC_TABLES = TABLES.filter(table => table !== 'job_locks');
const LOCAL_AUTHORITATIVE_TABLES = new Set([
  'portfolio_accounts',
  'positions',
  'risk_policy',
  'conversation_messages',
  'pending_actions',
]);
const TABLE_KEYS = Object.freeze({
  daily_summaries: ['date'],
  price_snapshots: ['ticker', 'source', 'price_type', 'as_of'],
  source_cursors: ['source_name'],
});
const DEFAULT_BATCH_SIZE = 200;

function tableKeys(table) {
  return TABLE_KEYS[table] || ['id'];
}

function rowKey(table, row) {
  const keys = tableKeys(table);
  const values = keys.map(key => row?.[key]);
  if (values.some(value => value === undefined || value === null || value === '')) {
    throw new Error(`${table}: migration key is missing (${keys.join(',')})`);
  }
  return values.map((value, index) => {
    if (['as_of', 'collected_at', 'created_at', 'updated_at'].includes(keys[index])) {
      const timestamp = Date.parse(value);
      if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
    }
    return String(value);
  }).join('\u001f');
}

function rowTimestamp(row = {}) {
  for (const field of ['updated_at', 'observed_at', 'collected_at', 'created_at']) {
    const value = Date.parse(row[field]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  if (typeof value === 'string' && value.includes('T')) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return value;
}

function stableRow(table, row = {}) {
  const comparable = { ...prepareWriteRow(table, row) };
  delete comparable.updated_at;
  return JSON.stringify(canonicalize(comparable));
}

function shouldUpdateTarget(table, source, target) {
  if (stableRow(table, source) === stableRow(table, target)) return false;
  if (!LOCAL_AUTHORITATIVE_TABLES.has(table)) return true;
  const sourceTime = rowTimestamp(source);
  const targetTime = rowTimestamp(target);
  if (sourceTime === null) return false;
  if (targetTime === null) return true;
  return sourceTime > targetTime;
}

function prepareWriteRow(table, row) {
  if (table !== 'price_snapshots') return row;
  const { id, ...withoutGeneratedId } = row;
  return withoutGeneratedId;
}

function buildTablePlan(table, sourceRows, targetRows) {
  const targetByKey = new Map(targetRows.map(row => [rowKey(table, row), row]));
  const sourceKeys = new Set(sourceRows.map(row => rowKey(table, row)));
  const inserts = [];
  const updates = [];
  const preserved = [];
  for (const source of sourceRows) {
    const target = targetByKey.get(rowKey(table, source));
    if (!target) {
      inserts.push(prepareWriteRow(table, source));
    } else if (shouldUpdateTarget(table, source, target)) {
      updates.push(prepareWriteRow(table, source));
    } else if (stableRow(table, source) !== stableRow(table, target)) {
      preserved.push(rowKey(table, target));
    }
  }
  const localOnly = targetRows.filter(row => !sourceKeys.has(rowKey(table, row))).length;
  return {
    table,
    sourceCount: sourceRows.length,
    targetCount: targetRows.length,
    inserts,
    updates,
    preserved,
    localOnly,
  };
}

function selectedTables(argv = process.argv) {
  const value = argv.find(arg => arg.startsWith('--tables='))?.slice('--tables='.length);
  if (!value) return SYNC_TABLES;
  const selected = [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
  const invalid = selected.filter(table => !SYNC_TABLES.includes(table));
  if (invalid.length > 0) throw new Error(`unsupported sync tables: ${invalid.join(', ')}`);
  return selected;
}

function targetUrl(baseUrl, table) {
  const base = new URL(baseUrl);
  const prefix = base.pathname.replace(/\/$/, '');
  base.pathname = `${prefix}/${table}`.replace(/\/+/g, '/');
  base.searchParams.set('on_conflict', tableKeys(table).join(','));
  return base;
}

async function writeBatch(table, rows, options = {}) {
  if (rows.length === 0) return;
  const response = await (options.fetchFn || fetch)(targetUrl(options.targetUrl, table), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
      ...(options.targetKey ? {
        apikey: options.targetKey,
        Authorization: `Bearer ${options.targetKey}`,
      } : {}),
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(Number(options.timeoutMs || 30_000)),
  });
  if (!response.ok) throw new Error(`${table}: target upsert failed (${response.status}): ${await response.text()}`);
}

async function applyPlan(plan, options = {}) {
  const rows = [...plan.inserts, ...plan.updates];
  const batchSize = Math.max(1, Number(options.batchSize || DEFAULT_BATCH_SIZE));
  for (let index = 0; index < rows.length; index += batchSize) {
    await writeBatch(plan.table, rows.slice(index, index + batchSize), options);
  }
  return rows.length;
}

function readConfig(env = process.env) {
  const sourceUrl = env.SUPABASE_PROJECT_URL || env.SUPABASE_URL;
  const sourceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  const targetUrlValue = env.DATABASE_REST_URL;
  if (!sourceUrl || !sourceKey) throw new Error('Supabase source URL/service key is required');
  if (!targetUrlValue) throw new Error('DATABASE_REST_URL is required for the local target');
  if (new URL(sourceUrl).origin === new URL(targetUrlValue).origin) {
    throw new Error('source and target REST endpoints must be different');
  }
  return {
    sourceUrl,
    sourceKey,
    targetUrl: targetUrlValue,
    targetKey: env.DATABASE_REST_KEY || '',
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const config = readConfig();
  let changes = 0;
  let preserved = 0;
  for (const table of selectedTables()) {
    const [sourceRows, targetRows] = await Promise.all([
      fetchTable(table, { supabaseUrl: config.sourceUrl, supabaseKey: config.sourceKey }),
      fetchTable(table, { databaseRestUrl: config.targetUrl, databaseRestKey: config.targetKey }),
    ]);
    const plan = buildTablePlan(table, sourceRows, targetRows);
    const planned = plan.inserts.length + plan.updates.length;
    changes += planned;
    preserved += plan.preserved.length;
    console.log(`[DB Sync] ${table}: source=${plan.sourceCount} target=${plan.targetCount} insert=${plan.inserts.length} update=${plan.updates.length} local-only=${plan.localOnly} preserve-newer-local=${plan.preserved.length}`);
    if (apply && planned > 0) await applyPlan(plan, { ...config });
  }
  console.log(`[DB Sync] ${apply ? 'apply complete' : 'dry-run complete'}: changes=${changes}, preserve-local=${preserved}`);
  if (!apply && changes > 0) console.log('[DB Sync] no rows were written. Use --apply only during the approved cutover window.');
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[DB Sync] failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  LOCAL_AUTHORITATIVE_TABLES,
  SYNC_TABLES,
  applyPlan,
  buildTablePlan,
  prepareWriteRow,
  readConfig,
  rowKey,
  selectedTables,
  shouldUpdateTarget,
  tableKeys,
  targetUrl,
  writeBatch,
};
