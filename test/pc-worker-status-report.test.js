const test = require('node:test');
const assert = require('node:assert/strict');

const { ageMinutes, formatStatus, isPreview } = require('../scripts/pc-worker-status-report');

test('PC worker status report separates heartbeat health and recent job outcomes', () => {
  const now = new Date('2026-08-05T00:10:00.000Z');
  const heartbeat = {
    worker_id: 'home-01',
    mode: 'shadow',
    gateway_connected: true,
    last_seen_at: '2026-08-05T00:09:00.000Z',
    running_jobs: 1,
    queued_jobs: 2,
  };
  const message = formatStatus(heartbeat, [
    { job_name: 'digest', status: 'success', scheduled_for: '2026-08-05T00:00:00.000Z' },
    { job_name: 'audit', status: 'failed', scheduled_for: '2026-08-04T23:00:00.000Z' },
  ], now);
  assert.equal(ageMinutes(heartbeat.last_seen_at, now), 1);
  assert.match(message, /PC Worker 상태 · 정상/);
  assert.match(message, /성공 1 · 실패 1/);
  assert.match(message, /최근 실패: audit/);
});

test('PC worker status report treats both dry-run flags as no-send previews', () => {
  assert.equal(isPreview(['--dry-run']), true);
  assert.equal(isPreview(['--no-report']), true);
  assert.equal(isPreview([]), false);
});
