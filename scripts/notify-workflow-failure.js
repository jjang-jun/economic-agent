#!/usr/bin/env node

const { sendReport } = require('../src/notify/reports');

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
    '🚨 <b>Workflow 실패</b>',
    '<b>상태</b>  자동 작업이 완료되지 않았습니다',
    `<b>워크플로우</b>  ${workflowName || 'unknown'}`,
    jobName ? `<b>작업</b>  ${jobName}` : '',
    `<b>브랜치</b>  <code>${branch || 'n/a'}</code>`,
    `<b>커밋</b>  <code>${shortSha}</code>`,
    actor ? `<b>실행자</b>  ${actor}` : '',
    runUrl ? `\n🔎 <a href="${runUrl}">실패 로그에서 원인 확인</a>` : '',
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

  await sendReport(message, 'ops');
  console.log('[workflow-failure] failure notification delivered');
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
