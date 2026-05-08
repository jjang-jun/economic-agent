#!/usr/bin/env node

const { sendTelegramMessage } = require('../src/notify/telegram');

function githubRunUrl(env = process.env) {
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  }
  return '';
}

function formatWorkflowFailureMessage({
  workflowName,
  jobName,
  branch,
  sha,
  actor,
  runUrl,
} = {}) {
  const shortSha = sha ? String(sha).slice(0, 7) : 'n/a';
  return [
    '⚠️ <b>Workflow 실패 알림</b>',
    `워크플로우: ${workflowName || 'unknown'}`,
    jobName ? `작업: ${jobName}` : '',
    `브랜치: ${branch || 'n/a'}`,
    `커밋: ${shortSha}`,
    actor ? `실행자: ${actor}` : '',
    runUrl ? `<a href="${runUrl}">GitHub Actions 로그 보기</a>` : '',
  ].filter(Boolean).join('\n');
}

async function main() {
  const workflowName = process.argv[2] || process.env.WORKFLOW_NAME || process.env.GITHUB_WORKFLOW || 'unknown';
  const jobName = process.argv[3] || process.env.JOB_NAME || '';
  const message = formatWorkflowFailureMessage({
    workflowName,
    jobName,
    branch: process.env.GITHUB_REF_NAME,
    sha: process.env.GITHUB_SHA,
    actor: process.env.GITHUB_ACTOR,
    runUrl: process.env.GITHUB_RUN_URL || githubRunUrl(),
  });

  await sendTelegramMessage(message, { channel: 'private' });
  console.log('[workflow-failure] private Telegram notification sent');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[workflow-failure] failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  formatWorkflowFailureMessage,
  githubRunUrl,
};
