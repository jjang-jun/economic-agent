const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const workflowFile = path.join(__dirname, '..', '.github', 'workflows', 'discord-smoke.yml');

test('Discord smoke runs before weekday preopen digest and defaults scheduled runs to ops', () => {
  const workflow = fs.readFileSync(workflowFile, 'utf8');
  assert.match(workflow, /cron: '10 23 \* \* 0-4'/);
  assert.match(workflow, /inputs\.channel \|\| 'ops'/);
  assert.match(workflow, /DISCORD_WEBHOOKS_JSON_BASE64/);
  assert.match(workflow, /Notify Discord on failure/);
});
