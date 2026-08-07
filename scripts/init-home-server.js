const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'infra', 'home-server', '.env');

function buildHomeEnv(password = crypto.randomBytes(24).toString('hex')) {
  return [
    'POSTGRES_DB=economic_agent',
    'POSTGRES_USER=postgres',
    `POSTGRES_PASSWORD=${password}`,
    'POSTGRES_PORT=5432',
    'POSTGREST_PORT=3210',
    '',
  ].join('\n');
}

function main() {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, buildHomeEnv(), { mode: 0o600, flag: 'wx' });
  console.log('[HomeServer] infra/home-server/.env 생성 완료 (비밀번호는 출력하지 않음)');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    if (err.code === 'EEXIST') {
      console.error('[HomeServer] infra/home-server/.env가 이미 있어 덮어쓰지 않았습니다.');
    } else {
      console.error(`[HomeServer] 초기화 실패: ${err.message}`);
    }
    process.exitCode = 1;
  }
}

module.exports = { TARGET, buildHomeEnv };
