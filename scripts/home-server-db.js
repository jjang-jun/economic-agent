const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const INFRA_DIR = path.join(ROOT, 'infra', 'home-server');
const COMPOSE_FILE = path.join(INFRA_DIR, 'docker-compose.yml');
const ENV_FILE = path.join(INFRA_DIR, '.env');
const SCHEMA_FILE = path.join(ROOT, 'supabase', 'schema.sql');

function dockerArgs(commandArgs) {
  return ['compose', '--env-file', ENV_FILE, '-f', COMPOSE_FILE, ...commandArgs];
}

function requireHomeEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error('infra/home-server/.env가 없습니다. .env.example을 복사하고 안전한 비밀번호를 설정하세요.');
  }
}

function readHomeConfig() {
  requireHomeEnv();
  const values = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return {
    database: values.POSTGRES_DB || 'economic_agent',
    user: values.POSTGRES_USER || 'postgres',
    postgrestPort: values.POSTGREST_PORT || '3210',
  };
}

function runDocker(commandArgs, options = {}) {
  const result = spawnSync('docker', dockerArgs(commandArgs), {
    cwd: ROOT,
    encoding: options.encoding === undefined ? 'utf8' : options.encoding,
    input: options.input,
    stdio: options.stdio || 'inherit',
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') {
    throw new Error('Docker를 찾을 수 없습니다. Docker Desktop 또는 Docker Engine + Compose를 먼저 설치하세요.');
  }
  if (result.status !== 0) throw new Error(`docker compose 실패 (exit ${result.status})`);
  return result;
}

async function check() {
  const config = readHomeConfig();
  runDocker(['version'], { stdio: 'inherit' });
  runDocker(['ps'], { stdio: 'inherit' });
  runDocker(['exec', '-T', 'database', 'pg_isready', '-U', config.user, '-d', config.database], { stdio: 'inherit' });
  const response = await fetch(`http://127.0.0.1:${config.postgrestPort}/`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`PostgREST 상태 확인 실패: HTTP ${response.status}`);
  console.log('[HomeServer] PostgreSQL/PostgREST 상태 정상');
}

async function main() {
  const command = process.argv[2] || 'status';
  requireHomeEnv();
  if (command === 'up') {
    runDocker(['up', '-d']);
    return;
  }
  if (command === 'down') {
    runDocker(['down']);
    return;
  }
  if (command === 'status') {
    runDocker(['ps']);
    return;
  }
  if (command === 'logs') {
    runDocker(['logs', '--tail', '200']);
    return;
  }
  if (command === 'schema') {
    const config = readHomeConfig();
    const schema = fs.readFileSync(SCHEMA_FILE);
    runDocker(['exec', '-T', 'database', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', config.user, '-d', config.database], {
      input: schema,
      stdio: ['pipe', 'inherit', 'inherit'],
      encoding: null,
    });
    runDocker([
      'exec', '-T', 'database', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', config.user, '-d', config.database,
      '-c', "grant usage on schema public to economic_agent_api; grant select, insert, update, delete on all tables in schema public to economic_agent_api; grant usage, select on all sequences in schema public to economic_agent_api; notify pgrst, 'reload schema';",
    ]);
    return;
  }
  if (command === 'check') {
    await check();
    return;
  }
  throw new Error(`지원하지 않는 명령: ${command}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[HomeServer] ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { COMPOSE_FILE, ENV_FILE, dockerArgs, readHomeConfig, requireHomeEnv, runDocker };
