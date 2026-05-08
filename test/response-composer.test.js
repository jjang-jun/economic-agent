const test = require('node:test');
const assert = require('node:assert/strict');
const { formatHelp } = require('../src/agent/response-composer');

test('formatHelp documents approved portfolio mutation commands', () => {
  const help = formatHelp();

  assert.match(help, /\/buy TICKER/);
  assert.match(help, /\/sell TICKER/);
  assert.match(help, /\/cash 금액/);
  assert.match(help, /\/pending/);
  assert.match(help, /\/recommendations - 리스크 기준/);
  assert.match(help, /\/recommendations blocked/);
  assert.match(help, /승인 버튼/);
  assert.match(help, /Supabase 포트폴리오/);
});
