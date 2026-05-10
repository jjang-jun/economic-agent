const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function readWorkflow(name) {
  return fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', name), 'utf8');
}

const cases = [
  {
    file: 'portfolio-snapshot.yml',
    workflowName: 'Portfolio Snapshot (포트폴리오 평가)',
    stepName: 'Build portfolio snapshot',
  },
  {
    file: 'stock-report.yml',
    workflowName: 'Stock Report (장 마감 분석)',
    stepName: 'Build and send stock report',
  },
  {
    file: 'evaluate-recommendations.yml',
    workflowName: 'Evaluate Recommendations (추천 성과 평가)',
    stepName: 'Evaluate and send recommendation performance',
  },
  {
    file: 'trade-performance.yml',
    workflowName: 'Trade Performance (실제 거래 성과)',
    stepName: 'Build and send trade performance',
  },
];

for (const { file, workflowName, stepName } of cases) {
  test(`${file} notifies private Telegram on failure`, () => {
    const workflow = readWorkflow(file);
    const escapedWorkflowName = workflowName.replace(/[()]/g, '\\$&');

    assert.match(workflow, new RegExp(`name: ${stepName}`));
    assert.match(workflow, /name: Notify private chat on failure/);
    assert.match(workflow, /if: failure\(\)/);
    assert.match(
      workflow,
      new RegExp(`npm run notify:workflow-failure -- "${escapedWorkflowName}" "${stepName}"`),
    );
    assert.match(workflow, /TELEGRAM_PRIVATE_CHAT_ID:/);
    assert.match(workflow, /GITHUB_RUN_URL:/);
  });
}
