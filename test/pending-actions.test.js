const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureActionUsable } = require('../src/agent/pending-actions');

test('ensureActionUsable rejects callback from a different chat', () => {
  assert.throws(() => ensureActionUsable({
    status: 'pending',
    chat_id: 'private-chat',
    confirmation_token: 'token',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }, 'token', { chatId: 'shared-chat' }), /chat mismatch/);
});

test('ensureActionUsable accepts matching chat and token', () => {
  assert.doesNotThrow(() => ensureActionUsable({
    status: 'pending',
    chat_id: 'private-chat',
    confirmation_token: 'token',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }, 'token', { chatId: 'private-chat' }));
});
