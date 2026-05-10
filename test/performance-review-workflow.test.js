const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function readWorkflow(name) {
  return fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', name), 'utf8');
}

test('weekly performance review workflow notifies private Telegram on failure', () => {
  const workflow = readWorkflow('performance-review-weekly.yml');

  assert.match(workflow, /name: Build and send weekly performance review/);
  assert.match(workflow, /name: Notify private chat on failure/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Performance Review Weekly \(주간 성과 리뷰\)" "Build and send weekly performance review"/);
  assert.match(workflow, /GITHUB_RUN_URL:/);
});

test('monthly performance review workflow notifies private Telegram on failure', () => {
  const workflow = readWorkflow('performance-review-monthly.yml');

  assert.match(workflow, /name: Build and send monthly performance review/);
  assert.match(workflow, /name: Notify private chat on failure/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Performance Review Monthly \(월간 성과 리뷰\)" "Build and send monthly performance review"/);
  assert.match(workflow, /GITHUB_RUN_URL:/);
});

