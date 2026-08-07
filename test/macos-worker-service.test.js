const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlist } = require('../scripts/macos-worker-service');

test('macOS worker plist uses computed absolute paths without embedding secrets', () => {
  const plist = buildPlist({
    root: '/Users/test/Economic & Agent',
    node: '/opt/node/bin/node',
    logDir: '/Users/test/logs',
  });
  assert.match(plist, /\/opt\/node\/bin\/node/);
  assert.match(plist, /--env-file-if-exists=\/Users\/test\/Economic &amp; Agent\/\.env/);
  assert.match(plist, /KeepAlive/);
  assert.match(plist, /RunAtLoad/);
  assert.doesNotMatch(plist, /DISCORD_BOT_TOKEN|POSTGRES_PASSWORD/);
  assert.doesNotMatch(plist, /caffeinate/);
});

test('macOS worker can prevent idle system sleep only while connected to AC power', () => {
  const plist = buildPlist({
    root: '/Users/test/economic-agent',
    node: '/opt/node/bin/node',
    preventSleepOnAc: true,
  });
  assert.match(plist, /<string>\/usr\/bin\/caffeinate<\/string>/);
  assert.match(plist, /<string>-s<\/string>/);
  assert.ok(plist.indexOf('/usr/bin/caffeinate') < plist.indexOf('/opt/node/bin/node'));
});
