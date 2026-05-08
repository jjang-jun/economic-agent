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
