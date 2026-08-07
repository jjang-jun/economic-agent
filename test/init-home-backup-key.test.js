const test = require('node:test');
const assert = require('node:assert/strict');
const { appendBackupKey, hasKey, rotateBackupKey } = require('../scripts/init-home-backup-key');

test('backup key initializer appends once without logging or replacing an existing key', () => {
  const initial = 'DATABASE_REST_URL=http://127.0.0.1:3210\n';
  const updated = appendBackupKey(initial, 'safe-key');
  assert.match(updated, /HOME_DB_BACKUP_KEY_BASE64=safe-key/);
  assert.equal(hasKey(updated), true);
  assert.equal(appendBackupKey(updated, 'replacement'), updated);
  assert.doesNotMatch(updated, /replacement/);
});

test('backup key rotation replaces the key without duplicating it', () => {
  const updated = rotateBackupKey('A=1\nHOME_DB_BACKUP_KEY_BASE64=old-key\nB=2\n', 'new-key');
  assert.equal(updated, 'A=1\nHOME_DB_BACKUP_KEY_BASE64=new-key\nB=2\n');
  assert.equal((updated.match(/HOME_DB_BACKUP_KEY_BASE64=/g) || []).length, 1);
});
