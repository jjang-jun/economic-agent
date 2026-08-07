const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { dockerArgs } = require('../scripts/home-server-db');
const { decrypt, encrypt, safeTimestamp, writeOffsiteBackup } = require('../scripts/backup-home-database');
const { parseCounts, parseDatabaseUrl } = require('../scripts/migrate-database-to-home');
const { buildHomeEnv } = require('../scripts/init-home-server');
const {
  buildTablePlan,
  prepareWriteRow,
  readConfig,
  rowKey,
  selectedTables,
  targetUrl,
} = require('../scripts/sync-supabase-to-home');

test('home server compose arguments use explicit private env and compose files', () => {
  const args = dockerArgs(['ps']);
  assert.equal(args[0], 'compose');
  assert.ok(args.includes('--env-file'));
  assert.ok(args.includes('-f'));
  assert.equal(args.at(-1), 'ps');
});

test('home server initializer creates a portable env without echoing secrets', () => {
  const env = buildHomeEnv('a'.repeat(48));
  assert.match(env, /POSTGRES_PASSWORD=a{48}/);
  assert.match(env, /POSTGREST_PORT=3210/);
});

test('home database ports stay loopback-only and PostgREST does not use the superuser', () => {
  const compose = fs.readFileSync(path.join(__dirname, '..', 'infra', 'home-server', 'docker-compose.yml'), 'utf8');
  const homeDbScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'home-server-db.js'), 'utf8');
  assert.match(compose, /127\.0\.0\.1:\$\{POSTGRES_PORT:-5432\}:5432/);
  assert.match(compose, /127\.0\.0\.1:\$\{POSTGREST_PORT:-3210\}:3000/);
  assert.match(compose, /PGRST_DB_ANON_ROLE: economic_agent_api/);
  assert.match(homeDbScript, /grant usage on schema public to economic_agent_api/);
  assert.doesNotMatch(compose, /PGRST_DB_ANON_ROLE:.*postgres\s*$/m);
});

test('home database backup encryption emits versioned AES-GCM payload', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const encrypted = encrypt(Buffer.from('financial-data'), key);
  assert.equal(encrypted.subarray(0, 5).toString(), 'EADB1');
  assert.ok(encrypted.length > 'financial-data'.length);
  assert.equal(decrypt(encrypted, key).toString(), 'financial-data');
  assert.equal(safeTimestamp(new Date('2026-08-05T01:02:03.004Z')), '2026-08-05T01-02-03-004Z');
});

test('offsite backup copies only encrypted payloads to a distinct directory', t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'economic-agent-backup-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const localDir = path.join(tempRoot, 'local');
  const offsiteDir = path.join(tempRoot, 'offsite');
  fs.mkdirSync(localDir);
  const source = path.join(localDir, 'economic-agent-test.dump.gz.aes');
  const encrypted = encrypt(Buffer.from('database-backup'), Buffer.alloc(32, 3).toString('base64'));
  fs.writeFileSync(source, encrypted);

  const target = writeOffsiteBackup(encrypted, source, offsiteDir);
  assert.equal(target, path.join(offsiteDir, path.basename(source)));
  assert.deepEqual(fs.readFileSync(target), encrypted);
  assert.throws(
    () => writeOffsiteBackup(Buffer.from('plaintext'), source.replace(/\.aes$/, ''), offsiteDir),
    /암호화 파일만/,
  );
});

test('source database URL parser keeps credentials out of docker arguments', () => {
  assert.deepEqual(parseDatabaseUrl('postgresql://user:p%40ss@db.example.com:6543/economic'), {
    host: 'db.example.com',
    port: '6543',
    user: 'user',
    password: 'p@ss',
    database: 'economic',
  });
});

test('database migration count output parses exact table counts', () => {
  assert.deepEqual(parseCounts('articles|12\npositions|3\n'), { articles: 12, positions: 3 });
});

test('incremental home sync inserts missing source rows without deleting local-only rows', () => {
  const plan = buildTablePlan('articles', [
    { id: 'shared', updated_at: '2026-08-06T00:00:00Z', title: 'new' },
    { id: 'source-only', updated_at: '2026-08-06T00:00:00Z' },
  ], [
    { id: 'shared', updated_at: '2026-08-05T00:00:00Z', title: 'old' },
    { id: 'local-only', updated_at: '2026-08-06T00:00:00Z' },
  ]);
  assert.deepEqual(plan.inserts.map(row => row.id), ['source-only']);
  assert.deepEqual(plan.updates.map(row => row.id), ['shared']);
  assert.equal(plan.targetCount, 2);
  assert.equal(plan.localOnly, 1);
});

test('incremental home sync preserves newer local portfolio state', () => {
  const plan = buildTablePlan('positions', [
    { id: 'position:1', quantity: 70, updated_at: '2026-08-05T00:00:00Z' },
  ], [
    { id: 'position:1', quantity: 73, updated_at: '2026-08-06T00:00:00Z' },
  ]);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.preserved.length, 1);
});

test('incremental home sync ignores metadata-only updated_at drift', () => {
  const plan = buildTablePlan('positions', [
    { id: 'position:1', quantity: 73, payload: { b: 2, a: 1 }, updated_at: '2026-08-06T02:00:00Z' },
  ], [
    { id: 'position:1', quantity: 73, payload: { a: 1, b: 2 }, updated_at: '2026-08-06T01:00:00Z' },
  ]);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.preserved.length, 0);
});

test('price snapshot sync uses its natural key and drops remote serial ids', () => {
  const row = { id: 99, ticker: '005930', source: 'kis', price_type: 'realtime', as_of: '2026-08-06T00:00:00Z' };
  assert.equal(rowKey('price_snapshots', row), '005930\u001fkis\u001frealtime\u001f2026-08-06T00:00:00.000Z');
  assert.equal(Object.hasOwn(prepareWriteRow('price_snapshots', row), 'id'), false);
  assert.equal(targetUrl('http://127.0.0.1:3210', 'price_snapshots').searchParams.get('on_conflict'), 'ticker,source,price_type,as_of');
  const plan = buildTablePlan('price_snapshots', [row], [{ ...row, id: 12, as_of: '2026-08-06T00:00:00+00:00' }]);
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.updates.length, 0);
});

test('incremental sync table filter is explicit and rejects unknown tables', () => {
  assert.deepEqual(selectedTables(['node', 'script', '--tables=positions,portfolio_accounts,positions']), [
    'positions',
    'portfolio_accounts',
  ]);
  assert.throws(() => selectedTables(['node', 'script', '--tables=secrets']), /unsupported sync tables/);
});

test('incremental home sync refuses identical source and target endpoints', () => {
  assert.throws(() => readConfig({
    SUPABASE_PROJECT_URL: 'https://db.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'key',
    DATABASE_REST_URL: 'https://db.example.test/rest',
  }), /must be different/);
});
