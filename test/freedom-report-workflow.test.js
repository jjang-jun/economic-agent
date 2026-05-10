const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('freedom report workflow sends private Telegram status after portfolio snapshot', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'freedom-report.yml'),
    'utf8',
  );

  assert.match(workflow, /name: Freedom Report \(경제적 자유 상태\)/);
  assert.match(workflow, /cron: '20 7 \* \* 1-5'/);
  assert.match(workflow, /concurrency:\n  group: economic-agent-freedom-report\n  cancel-in-progress: false/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /run: npm run freedom:report -- --telegram/);
  assert.match(workflow, /TELEGRAM_PRIVATE_CHAT_ID:/);
  assert.match(workflow, /name: Notify private chat on failure/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Freedom Report \(경제적 자유 상태\)" "Build and send freedom report"/);
});
