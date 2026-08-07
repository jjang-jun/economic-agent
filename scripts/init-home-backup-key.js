const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_ENV_FILE = path.join(ROOT, '.env');
const KEY_NAME = 'HOME_DB_BACKUP_KEY_BASE64';

function hasKey(contents = '') {
  return new RegExp(`^${KEY_NAME}=\\S+`, 'm').test(contents);
}

function appendBackupKey(contents, key) {
  if (hasKey(contents)) return contents;
  const prefix = contents && !contents.endsWith('\n') ? '\n' : '';
  return `${contents}${prefix}${KEY_NAME}=${key}\n`;
}

function rotateBackupKey(contents, key) {
  if (!hasKey(contents)) return appendBackupKey(contents, key);
  return contents.replace(new RegExp(`^${KEY_NAME}=\\S+`, 'm'), `${KEY_NAME}=${key}`);
}

function main(file = DEFAULT_ENV_FILE, options = {}) {
  const contents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (hasKey(contents) && !options.rotate) {
    console.log('[HomeServer] 백업 암호화 키가 이미 설정되어 있어 변경하지 않았습니다.');
    return false;
  }
  const key = crypto.randomBytes(32).toString('base64');
  const updated = options.rotate ? rotateBackupKey(contents, key) : appendBackupKey(contents, key);
  fs.writeFileSync(file, updated, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  console.log(`[HomeServer] 32바이트 백업 암호화 키 ${options.rotate ? '교체' : '생성'} 완료 (값은 출력하지 않음)`);
  return true;
}

if (require.main === module) {
  try {
    main(DEFAULT_ENV_FILE, { rotate: process.argv.includes('--rotate') });
  } catch (error) {
    console.error(`[HomeServer] 백업 키 초기화 실패: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { DEFAULT_ENV_FILE, KEY_NAME, appendBackupKey, hasKey, main, rotateBackupKey };
