const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatWorkflowFailureMessage,
  githubRunUrl,
} = require('../scripts/notify-workflow-failure');

test('formatWorkflowFailureMessage renders actionable private alert', () => {
  const message = formatWorkflowFailureMessage({
    workflowName: 'Telegram 승인 흐름 점검',
    jobName: 'Smoke pending action flow',
    branch: 'main',
    sha: '9646e1f123456',
    actor: 'jjang-jun',
    runUrl: 'https://github.com/jjang-jun/economic-agent/actions/runs/1',
  });

  assert.match(message, /Workflow 실패 알림/);
  assert.match(message, /Telegram 승인 흐름 점검/);
  assert.match(message, /Smoke pending action flow/);
  assert.match(message, /9646e1f/);
  assert.match(message, /GitHub Actions 로그 보기/);
});

test('githubRunUrl builds actions run URL from GitHub environment', () => {
  assert.equal(githubRunUrl({
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'jjang-jun/economic-agent',
    GITHUB_RUN_ID: '123',
  }), 'https://github.com/jjang-jun/economic-agent/actions/runs/123');
});

test('every GitHub Actions workflow has a private failure notification step', () => {
  const workflowDir = path.join(__dirname, '..', '.github', 'workflows');
  const workflowFiles = fs.readdirSync(workflowDir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));

  assert.ok(workflowFiles.length > 0);

  for (const file of workflowFiles) {
    const workflow = fs.readFileSync(path.join(workflowDir, file), 'utf8');

    assert.match(workflow, /name: Notify private chat on failure/, file);
    assert.match(workflow, /if: failure\(\)/, file);
    assert.match(workflow, /npm run notify:workflow-failure --/, file);
    assert.match(workflow, /GITHUB_RUN_URL:/, file);
    assert.match(workflow, /timeout-minutes: 10/, file);
    assert.match(workflow, /permissions:\s*\n\s*contents: read/, file);
    assert.match(workflow, /actions\/checkout@v6/, file);
    assert.match(workflow, /actions\/setup-node@v6/, file);
    assert.match(workflow, /concurrency:\s*\n\s*group: economic-agent-/, file);
    assert.match(workflow, /cancel-in-progress: (true|false)/, file);
  }
});
