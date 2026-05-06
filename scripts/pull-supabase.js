const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY;
const OUT_DIR = path.join(__dirname, '..', 'data', 'supabase');
const DB_FILE = path.join(__dirname, '..', 'data', 'economic-agent.db');

const TABLES = [
  'articles',
  'daily_summaries',
  'stock_reports',
  'recommendations',
  'recommendation_evaluations',
  'trade_executions',
  'market_snapshots',
  'investor_flows',
  'decision_contexts',
];

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('SUPABASE_PROJECT_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_PUBLISHABLE_KEY are required.');
    process.exit(1);
  }
}

async function fetchTable(table) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  url.searchParams.set('select', '*');

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${table}: ${res.status} ${body}`);
  }
  return res.json();
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function writeSqlite(table, rows) {
  execFileSync('sqlite3', [DB_FILE, `create table if not exists ${table} (id text primary key, row_json text not null);`]);
  execFileSync('sqlite3', [DB_FILE, `delete from ${table};`]);

  for (const row of rows) {
    const id = row.id || row.date || `${table}:${Math.random()}`;
    const json = JSON.stringify(row);
    execFileSync('sqlite3', [
      DB_FILE,
      `insert or replace into ${table} (id, row_json) values (${sqlString(id)}, ${sqlString(json)});`,
    ]);
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

main().catch(err => {
  console.error('[DB] pull failed:', err.message);
  process.exit(1);
});
