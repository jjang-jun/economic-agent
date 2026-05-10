const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function readWorkflow(name) {
  return fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', name), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const cases = [
  {
    file: 'news-alert.yml',
    workflowName: 'News Collector Backup (뉴스 수집 백업)',
    stepName: 'Collect backup news alerts',
  },
  {
    file: 'digest-morning.yml',
    workflowName: 'Digest 개장 전 브리핑 (08:20 KST)',
    stepName: 'Build and send preopen digest',
  },
  {
    file: 'digest-lunch.yml',
    workflowName: 'Digest 오전장 점검 (11:50 KST)',
    stepName: 'Build and send midday digest',
  },
  {
    file: 'digest-close.yml',
    workflowName: 'Digest 장 마감 브리핑 (15:45 KST)',
    stepName: 'Build and send close digest',
  },
  {
    file: 'digest-evening.yml',
    workflowName: 'Digest 유럽장 체크 (17:10 KST)',
    stepName: 'Build and send europe digest',
  },
  {
    file: 'digest-night.yml',
    workflowName: 'Digest 미국장 오픈 브리핑 (22:40 KST)',
    stepName: 'Build and send usopen digest',
  },
];

for (const { file, workflowName, stepName } of cases) {
  test(`${file} notifies private Telegram on failure`, () => {
    const workflow = readWorkflow(file);

    assert.match(workflow, new RegExp(`name: ${escapeRegExp(stepName)}`));
    assert.match(workflow, /name: Notify private chat on failure/);
    assert.match(workflow, /if: failure\(\)/);
    assert.match(
      workflow,
      new RegExp(`npm run notify:workflow-failure -- "${escapeRegExp(workflowName)}" "${escapeRegExp(stepName)}"`),
    );
    assert.match(workflow, /TELEGRAM_PRIVATE_CHAT_ID:/);
    assert.match(workflow, /GITHUB_RUN_URL:/);
  });
}
