const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('security audit workflow runs npm audit weekly and notifies on failure', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'security-audit.yml'),
    'utf8',
  );

  assert.match(workflow, /name: Security Audit \(의존성 취약점 점검\)/);
  assert.match(workflow, /cron: '10 0 \* \* 0'/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /name: Run dependency security audit/);
  assert.match(workflow, /run: npm run security:audit/);
  assert.match(workflow, /name: Notify private chat on failure/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Security Audit \(의존성 취약점 점검\)" "Run dependency security audit"/);
  assert.match(workflow, /GITHUB_RUN_URL:/);
});
