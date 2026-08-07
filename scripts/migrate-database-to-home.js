const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { dockerArgs, readHomeConfig } = require('./home-server-db');
const { TABLES } = require('./pull-supabase');

const ROOT = path.resolve(__dirname, '..');
const EXPORT_DIR = path.join(ROOT, 'data', 'database-migration');
const SOURCE_IMAGE = 'postgres:17-alpine';
const EMPTY_CHECK_TABLES = [
  'articles',
  'recommendations',
  'trade_executions',
  'portfolio_accounts',
  'conversation_messages',
  'pending_actions',
];
const VERIFY_TABLES = [...TABLES];

function parseDatabaseUrl(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('source URL must use postgres:// or postgresql://');
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username || 'postgres'),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || 'postgres'),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: options.encoding === undefined ? null : options.encoding,
    env: options.env || process.env,
    input: options.input,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') throw new Error(`${command} command not found`);
  if (result.status !== 0) {
    throw new Error(`${command} failed (exit ${result.status}): ${String(result.stderr || '').trim()}`);
  }
  return result;
}

function exportSource(targetFile) {
  const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!sourceUrl) throw new Error('SOURCE_DATABASE_URL is required for the one-time export');
  const source = parseDatabaseUrl(sourceUrl);
  const result = run('docker', [
    'run', '--rm', '-e', 'PGPASSWORD', SOURCE_IMAGE,
    'pg_dump', '--format=custom', '--data-only', '--no-owner', '--no-privileges',
    '--schema=public', '--exclude-table-data=public.api_token_cache',
    '--exclude-table-data=public.worker_job_runs', '--exclude-table-data=public.worker_heartbeats',
    '--host', source.host, '--port', source.port,
    '--username', source.user, '--dbname', source.database,
  ], {
    env: { ...process.env, PGPASSWORD: source.password },
  });
  fs.mkdirSync(path.dirname(targetFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(targetFile, result.stdout, { mode: 0o600, flag: 'wx' });
  console.log(`[DB Migration] source export complete: ${targetFile} (${result.stdout.length} bytes)`);
}

function assertTargetEmpty() {
  const config = readHomeConfig();
  const sql = EMPTY_CHECK_TABLES
    .map(table => `select '${table}' as table_name, count(*)::bigint as row_count from ${table}`)
    .join(' union all ');
  const result = run('docker', dockerArgs([
    'exec', '-T', 'database', 'psql', '-At', '-U', config.user, '-d', config.database, '-c', sql,
  ]), { encoding: 'utf8' });
  const nonEmpty = String(result.stdout || '').trim().split('\n').filter(Boolean).filter(line => {
    const count = Number(line.split('|')[1] || 0);
    return count > 0;
  });
  if (nonEmpty.length > 0) {
    throw new Error(`target database is not empty: ${nonEmpty.join(', ')}`);
  }
}

function applyExport(sourceFile) {
  if (!process.argv.includes('--confirm-empty-target')) {
    throw new Error('apply requires --confirm-empty-target after reviewing the target DB');
  }
  if (!fs.existsSync(sourceFile)) throw new Error(`export file not found: ${sourceFile}`);
  assertTargetEmpty();
  const config = readHomeConfig();
  const contents = fs.readFileSync(sourceFile);
  run('docker', dockerArgs([
    'exec', '-T', 'database', 'pg_restore', '--data-only', '--disable-triggers',
    '--no-owner', '--no-privileges', '--exit-on-error', '-U', config.user, '-d', config.database,
  ]), { input: contents });
  console.log('[DB Migration] local PostgreSQL import complete. Run db:pull and compare counts before cutover.');
}

function countSql() {
  return VERIFY_TABLES
    .map(table => `select '${table}' as table_name, count(*)::bigint as row_count from ${table}`)
    .join(' union all ');
}

function parseCounts(output) {
  return Object.fromEntries(String(output || '').trim().split('\n').filter(Boolean).map(line => {
    const [table, count] = line.split('|');
    return [table, Number(count)];
  }));
}

function verifyCounts() {
  const config = readHomeConfig();
  const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!sourceUrl) throw new Error('SOURCE_DATABASE_URL is required for source/target verification');
  const source = parseDatabaseUrl(sourceUrl);
  const sql = countSql();
  const sourceResult = run('docker', [
    'run', '--rm', '-e', 'PGPASSWORD', SOURCE_IMAGE,
    'psql', '-At', '--host', source.host, '--port', source.port,
    '--username', source.user, '--dbname', source.database, '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: source.password } });
  const targetResult = run('docker', dockerArgs([
    'exec', '-T', 'database', 'psql', '-At', '-U', config.user, '-d', config.database, '-c', sql,
  ]), { encoding: 'utf8' });
  const sourceCounts = parseCounts(sourceResult.stdout);
  const targetCounts = parseCounts(targetResult.stdout);
  const mismatches = VERIFY_TABLES.filter(table => sourceCounts[table] !== targetCounts[table]);
  for (const table of VERIFY_TABLES) {
    const marker = mismatches.includes(table) ? 'MISMATCH' : 'ok';
    console.log(`[DB Migration] ${marker} ${table}: source=${sourceCounts[table]} target=${targetCounts[table]}`);
  }
  if (mismatches.length > 0) throw new Error(`row-count verification failed: ${mismatches.join(', ')}`);
  console.log(`[DB Migration] all ${VERIFY_TABLES.length} table counts match`);
}

function defaultExportFile() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(EXPORT_DIR, `source-${stamp}.dump`);
}

function main() {
  const command = process.argv[2] || 'export';
  if (command === 'export') {
    exportSource(path.resolve(process.argv[3] || defaultExportFile()));
    return;
  }
  if (command === 'apply') {
    const sourceFile = process.argv[3];
    if (!sourceFile) throw new Error('apply requires the exported dump path');
    applyExport(path.resolve(sourceFile));
    return;
  }
  if (command === 'verify') {
    verifyCounts();
    return;
  }
  throw new Error(`unsupported migration command: ${command}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[DB Migration] ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { EMPTY_CHECK_TABLES, VERIFY_TABLES, defaultExportFile, parseCounts, parseDatabaseUrl };
