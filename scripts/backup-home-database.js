const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { dockerArgs, readHomeConfig } = require('./home-server-db');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.resolve(process.env.HOME_DB_BACKUP_DIR || path.join(ROOT, 'data', 'backups'));

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function encrypt(buffer, rawKey) {
  const key = Buffer.from(rawKey, 'base64');
  if (key.length !== 32) throw new Error('HOME_DB_BACKUP_KEY_BASE64는 정확히 32바이트 base64 키여야 합니다.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('EADB1'), iv, tag, ciphertext]);
}

function decrypt(buffer, rawKey) {
  const key = Buffer.from(rawKey, 'base64');
  if (key.length !== 32) throw new Error('HOME_DB_BACKUP_KEY_BASE64는 정확히 32바이트 base64 키여야 합니다.');
  if (buffer.subarray(0, 5).toString() !== 'EADB1') throw new Error('지원하지 않는 암호화 백업 형식입니다.');
  const iv = buffer.subarray(5, 17);
  const tag = buffer.subarray(17, 33);
  const ciphertext = buffer.subarray(33);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function writeOffsiteBackup(contents, localTarget, offsiteDir) {
  const destinationDir = String(offsiteDir || '').trim();
  if (!destinationDir) return null;
  if (contents.subarray(0, 5).toString() !== 'EADB1' || !localTarget.endsWith('.aes')) {
    throw new Error('외부 백업에는 AES-256-GCM 암호화 파일만 복제할 수 있습니다.');
  }

  const resolvedDir = path.resolve(destinationDir);
  const target = path.join(resolvedDir, path.basename(localTarget));
  if (path.resolve(localTarget) === target) {
    throw new Error('HOME_DB_OFFSITE_BACKUP_DIR는 로컬 백업 경로와 달라야 합니다.');
  }

  fs.mkdirSync(resolvedDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, contents, { mode: 0o600, flag: 'wx' });
  return target;
}

function main() {
  const backupKey = String(process.env.HOME_DB_BACKUP_KEY_BASE64 || '').trim();
  const offsiteDir = String(process.env.HOME_DB_OFFSITE_BACKUP_DIR || '').trim();
  if (offsiteDir && !backupKey) {
    throw new Error('외부 백업을 사용하려면 HOME_DB_BACKUP_KEY_BASE64가 필요합니다.');
  }

  const config = readHomeConfig();
  const result = spawnSync('docker', dockerArgs([
    'exec', '-T', 'database', 'pg_dump',
    '--format=custom', '--no-owner', '--no-privileges',
    '-U', config.user, '-d', config.database,
  ]), {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') throw new Error('Docker를 찾을 수 없습니다.');
  if (result.status !== 0) {
    throw new Error(`pg_dump 실패 (exit ${result.status}): ${String(result.stderr || '').trim()}`);
  }

  const compressed = zlib.gzipSync(result.stdout, { level: 9 });
  const encrypted = Boolean(backupKey);
  const contents = encrypted ? encrypt(compressed, backupKey) : compressed;
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const extension = encrypted ? '.dump.gz.aes' : '.dump.gz';
  const target = path.join(BACKUP_DIR, `economic-agent-${safeTimestamp()}${extension}`);
  fs.writeFileSync(target, contents, { mode: 0o600, flag: 'wx' });
  console.log(`[HomeServer] DB 백업 완료: ${target} (${contents.length} bytes, encrypted=${encrypted})`);
  const offsiteTarget = writeOffsiteBackup(contents, target, offsiteDir);
  if (offsiteTarget) console.log(`[HomeServer] 외부 암호화 백업 완료: ${offsiteTarget}`);
  if (!encrypted) console.warn('[HomeServer] 경고: HOME_DB_BACKUP_KEY_BASE64가 없어 백업이 암호화되지 않았습니다.');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[HomeServer] 백업 실패: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { decrypt, encrypt, safeTimestamp, writeOffsiteBackup };
