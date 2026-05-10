const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('quality gate workflow runs tests and harness check on main pushes', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'quality-gate.yml'),
    'utf8',
  );

  assert.match(workflow, /name: Quality Gate \(테스트와 문서 점검\)/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /- main/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /name: Run test suite/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /name: Check agent harness docs/);
  assert.match(workflow, /run: npm run agent:harness-check/);
  assert.match(workflow, /name: Notify private chat on failure/);
  assert.match(workflow, /if: failure\(\) && github\.event_name != 'pull_request'/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Quality Gate \(테스트와 문서 점검\)" "Run test suite \/ Check agent harness docs"/);
  assert.match(workflow, /GITHUB_RUN_URL:/);
});
