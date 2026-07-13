const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function workflow(name) {
  return fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8');
}

test('all five regular digests remain scheduled', () => {
  for (const name of [
    'digest-morning.yml',
    'digest-lunch.yml',
    'digest-close.yml',
    'digest-evening.yml',
    'digest-night.yml',
  ]) {
    assert.match(workflow(name), /cron:/, `${name} should remain scheduled`);
    assert.match(workflow(name), /workflow_dispatch:/);
  }
});
