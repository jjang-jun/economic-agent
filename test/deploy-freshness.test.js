const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseArgs,
  evaluateDeployFreshness,
  formatFetchError,
  formatDeployFreshnessMessage,
} = require('../scripts/deploy-freshness-check');

test('deploy freshness args read url and expected sha from env and flags', () => {
  assert.deepEqual(parseArgs(['--noTelegram'], {
    AGENT_SERVER_URL: 'https://example.com/',
    GITHUB_SHA: 'abc123',
  }), {
    url: 'https://example.com',
    expectedSha: 'abc123',
    noTelegram: true,
    timeoutMs: 8000,
  });

  assert.equal(parseArgs(['--url=https://server', '--expected-sha=def456'], {}).url, 'https://server');
  assert.equal(parseArgs(['--url=https://server', '--expected-sha=def456'], {}).expectedSha, 'def456');
});

test('evaluateDeployFreshness detects fresh, stale, and missing metadata', () => {
  assert.equal(evaluateDeployFreshness({ commitSha: 'abcdef123' }, 'abcdef123').ok, true);

  const stale = evaluateDeployFreshness({ commitSha: 'abcdef123' }, '9999999');
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale');

  const missing = evaluateDeployFreshness({}, 'abcdef123');
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'deployed_sha_missing');
});

test('formatDeployFreshnessMessage includes actionable deploy metadata', () => {
  const message = formatDeployFreshnessMessage(
    evaluateDeployFreshness({ commitSha: 'abcdef123' }, '9999999'),
    { revision: 'economic-agent-00001', serviceName: 'economic-agent' },
    'https://server',
  );

  assert.match(message, /배포 최신성 점검/);
  assert.match(message, /확인 필요/);
  assert.match(message, /abcdef1/);
  assert.match(message, /9999999/);
  assert.match(message, /economic-agent-00001/);
});

test('formatFetchError includes DNS or network cause code', () => {
  const err = new TypeError('fetch failed');
  err.cause = Object.assign(new Error('getaddrinfo ENOTFOUND example.com'), { code: 'ENOTFOUND' });

  assert.match(formatFetchError(err, 'https://example.com'), /ENOTFOUND/);
  assert.match(formatFetchError(err, 'https:\/\/example.com'), /getaddrinfo ENOTFOUND/);
});

test('deploy freshness workflow notifies private Telegram on failure', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'deploy-freshness.yml'),
    'utf8',
  );

  assert.match(workflow, /20 0 \* \* 1-5/);
  assert.match(workflow, /name: Check deployed server freshness/);
  assert.match(workflow, /npm run deploy:freshness/);
  assert.match(workflow, /name: Notify private chat on failure/);
  assert.match(workflow, /npm run notify:workflow-failure -- "Deploy Freshness Check \(서버 배포 최신성 점검\)" "Check deployed server freshness"/);
});
