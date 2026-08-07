const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, parseWebhookId, validateKeys } = require('../scripts/rotate-discord-webhooks');

test('webhook rotation parses only Discord webhook ids without exposing tokens', () => {
  assert.equal(
    parseWebhookId('https://discord.com/api/webhooks/123456789012345678/secret-token'),
    '123456789012345678',
  );
  assert.equal(parseWebhookId('https://example.com/api/webhooks/123456789012345678/token'), '');
  assert.equal(parseWebhookId('invalid'), '');
});

test('webhook rotation validates and deduplicates selected channel keys', () => {
  assert.deepEqual(validateKeys(['policy_tax', 'policy_tax', 'policy_real_estate']), [
    'policy_tax',
    'policy_real_estate',
  ]);
  assert.throws(() => validateKeys([]), /--keys/);
  assert.throws(() => validateKeys(['unknown']), /Unknown Discord channel/);
});

test('webhook rotation supports prepare and revoke phases', () => {
  assert.deepEqual(parseArgs(['--keys=policy_tax,policy_real_estate']).keys, [
    'policy_tax',
    'policy_real_estate',
  ]);
  assert.equal(parseArgs(['--revoke-old']).revokeOld, true);
});
