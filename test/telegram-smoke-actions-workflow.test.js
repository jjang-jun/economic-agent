const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('telegram smoke workflow tolerates scheduled transient Supabase outages', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'telegram-smoke-actions.yml'),
    'utf8',
  );

  assert.match(workflow, /TELEGRAM_SMOKE_ALLOW_TRANSIENT_SUPABASE:/);
  assert.match(workflow, /github\.event_name == 'schedule'/);
  assert.match(workflow, /SUPABASE_RETRY_COUNT:.*github\.event_name == 'schedule'.*'1'.*'5'/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Telegram 승인 흐름 점검" "Smoke pending action flow"/);
});
