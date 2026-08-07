const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { decrypt } = require('./backup-home-database');
const { dockerArgs, readHomeConfig } = require('./home-server-db');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    input: options.input,
    encoding: options.encoding === undefined ? null : options.encoding,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') throw new Error(`${command} 명령을 찾을 수 없습니다.`);
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} 실패 (exit ${result.status}): ${String(result.stderr || '').trim()}`);
  }
  return result;
}

function restoreDrill(dump) {
  const config = readHomeConfig();
  const database = `economic_agent_restore_${process.pid}_${Date.now()}`;
  let created = false;
  try {
    run('docker', dockerArgs([
      'exec', '-T', 'database', 'createdb', '-U', config.user, database,
    ]));
    created = true;
    run('docker', dockerArgs([
      'exec', '-T', 'database', 'pg_restore', '--no-owner', '--no-privileges',
      '--exit-on-error', '-U', config.user, '-d', database,
    ]), { input: dump });
    const result = run('docker', dockerArgs([
      'exec', '-T', 'database', 'psql', '-At', '-U', config.user, '-d', database,
      '-c', "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'; select count(*) from articles;",
    ]), { encoding: 'utf8' });
    const [tables, articles] = String(result.stdout || '').trim().split('\n').map(Number);
    if (!Number.isFinite(tables) || tables < 29) throw new Error(`복원 테이블 수가 부족합니다: ${tables}`);
    if (!Number.isFinite(articles) || articles < 1) throw new Error(`복원 기사 데이터가 비어 있습니다: ${articles}`);
    console.log(`[HomeServer] 임시 DB 복원 검증 완료: 테이블 ${tables}개 · 기사 ${articles}건`);
  } finally {
    if (created) {
      run('docker', dockerArgs([
        'exec', '-T', 'database', 'dropdb', '--force', '-U', config.user, database,
      ]), { allowFailure: true });
    }
  }
}

function main() {
  const input = process.argv[2];
  if (!input) throw new Error('검증할 백업 파일 경로가 필요합니다.');
  const file = path.resolve(input);
  let contents = fs.readFileSync(file);
  if (contents.subarray(0, 5).toString() === 'EADB1') {
    const key = String(process.env.HOME_DB_BACKUP_KEY_BASE64 || '').trim();
    if (!key) throw new Error('암호화 백업 검증에는 HOME_DB_BACKUP_KEY_BASE64가 필요합니다.');
    contents = decrypt(contents, key);
  }
  const dump = zlib.gunzipSync(contents);
  if (dump.subarray(0, 5).toString() !== 'PGDMP') throw new Error('유효한 PostgreSQL custom dump가 아닙니다.');
  const result = spawnSync('docker', [
    'run', '--rm', '-i', 'postgres:17-alpine', 'pg_restore', '--list',
  ], { input: dump, encoding: null, maxBuffer: 512 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') throw new Error('Docker를 찾을 수 없습니다.');
  if (result.status !== 0) throw new Error(`pg_restore --list 실패 (exit ${result.status})`);
  const entries = String(result.stdout || '').split('\n').filter(line => /^\d+;/.test(line)).length;
  console.log(`[HomeServer] 백업 구조 검증 완료: ${file} (${entries} TOC entries)`);
  if (process.argv.includes('--restore-drill')) restoreDrill(dump);
}

module.exports = { restoreDrill, run };

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[HomeServer] 백업 검증 실패: ${err.message}`);
    process.exitCode = 1;
  }
}
