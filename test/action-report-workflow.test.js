const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldSkipTelegram } = require('../scripts/action-report');

test('action report workflow notifies private Telegram on failure', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'action-report.yml'), 'utf8');

  assert.match(workflow, /name: Build and send action report/);
  assert.match(workflow, /name: Notify private chat on failure/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Action Report \(일일 행동 리포트\)" "Build and send action report"/);
  assert.match(workflow, /GITHUB_RUN_URL:/);
});

test('action report script accepts both noTelegram flag spellings', () => {
  assert.equal(shouldSkipTelegram(['node', 'scripts/action-report.js', '--noTelegram']), true);
  assert.equal(shouldSkipTelegram(['node', 'scripts/action-report.js', '--no-telegram']), true);
  assert.equal(shouldSkipTelegram(['node', 'scripts/action-report.js']), false);
});
