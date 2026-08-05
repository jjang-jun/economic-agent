const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResponse } = require('../src/agent/agent-router');

test('Discord-style sensitive read-only mode never enables portfolio mutations', async () => {
  const result = await buildResponse('/buy 005930 1 70000', { allowSensitiveReadOnly: true });
  assert.equal(result.intent, 'pending_action_requires_chat');
  assert.match(result.response, /Slash 명령으로 실행하지 않습니다/);
  assert.match(result.response, /봇을 멘션해 자연어 초안/);
});
