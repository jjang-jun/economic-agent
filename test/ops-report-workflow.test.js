const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function readWorkflow(name) {
  return fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', name), 'utf8');
}

test('collector ops workflow notifies private Telegram on failure', () => {
  const workflow = readWorkflow('collector-ops-report.yml');

  assert.match(workflow, /name: Build and send collector ops report/);
  assert.match(workflow, /name: Notify private chat on failure/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Collector Ops Report \(수집기 운영 점검\)" "Build and send collector ops report"/);
  assert.match(workflow, /GITHUB_RUN_URL:/);
});

test('price provider ops workflow notifies private Telegram on failure', () => {
  const workflow = readWorkflow('price-provider-ops-report.yml');

  assert.match(workflow, /name: Build and send price provider ops report/);
  assert.match(workflow, /name: Notify private chat on failure/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Price Provider Ops Report \(가격 데이터 점검\)" "Build and send price provider ops report"/);
  assert.match(workflow, /GITHUB_RUN_URL:/);
});

