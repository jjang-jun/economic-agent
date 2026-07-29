const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('telegram smoke workflow surfaces scheduled Supabase outages', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'telegram-smoke-actions.yml'),
    'utf8',
  );

  assert.doesNotMatch(workflow, /TELEGRAM_SMOKE_ALLOW_TRANSIENT_SUPABASE:/);
  assert.match(workflow, /SUPABASE_RETRY_COUNT:.*github\.event_name == 'schedule'.*'1'.*'5'/);
  assert.match(workflow, /SUPABASE_REQUEST_TIMEOUT_MS: 10000/);
  assert.match(workflow, /TELEGRAM_REQUEST_TIMEOUT_MS: 10000/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Telegram 승인 흐름 점검" "Smoke pending action flow"/);
});
