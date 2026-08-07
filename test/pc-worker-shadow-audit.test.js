const test = require('node:test');
const assert = require('node:assert/strict');
const { enumerateDueOccurrences } = require('../src/worker/pc-scheduler');
const { auditShadowObservation, formatShadowAudit } = require('../src/worker/shadow-audit');

const hourlyJob = {
  id: 'hourly',
  script: 'noop',
  when: parts => parts.minute === 0,
  catchUpMinutes: 10_000,
};

function recordedRuns(startedAt, now) {
  return enumerateDueOccurrences({
    jobs: [hourlyJob],
    after: new Date(startedAt),
    now: new Date(now),
    maxCatchUpMinutes: 10_000,
  }).map(item => ({
    id: item.id,
    job_name: item.job.id,
    scheduled_for: item.scheduledFor,
    mode: 'shadow',
    status: 'shadow_due',
    finished_at: new Date(Date.parse(item.scheduledFor) + 60_000).toISOString(),
  }));
}

test('shadow audit becomes ready only after complete schedule and healthy heartbeat', () => {
  const startedAt = '2026-08-01T00:00:00.000Z';
  const now = '2026-08-04T01:00:00.000Z';
  const runs = recordedRuns(startedAt, '2026-08-04T00:58:00.000Z');
  const audit = auditShadowObservation({
    startedAt,
    now,
    jobs: [hourlyJob],
    runs,
    heartbeat: {
      mode: 'shadow',
      gateway_connected: true,
      started_at: '2026-08-01T00:00:00.000Z',
      last_seen_at: '2026-08-04T00:59:00.000Z',
    },
  });
  assert.equal(audit.observationComplete, true);
  assert.equal(audit.missing.length, 0);
  assert.equal(audit.delayed.length, 0);
  assert.equal(audit.ready, true);
  assert.equal(audit.restartedAfterObservationStart, false);
  assert.match(formatShadowAudit(audit), /전환 준비 완료/);
});

test('shadow audit reports missing and excessively delayed occurrences', () => {
  const startedAt = '2026-08-01T00:00:00.000Z';
  const now = '2026-08-04T01:00:00.000Z';
  const runs = recordedRuns(startedAt, '2026-08-04T00:58:00.000Z');
  runs.shift();
  runs[0].finished_at = new Date(Date.parse(runs[0].scheduled_for) + 11 * 60_000).toISOString();
  const audit = auditShadowObservation({
    startedAt,
    now,
    jobs: [hourlyJob],
    runs,
    heartbeat: {
      mode: 'shadow',
      gateway_connected: false,
      started_at: '2026-08-04T00:30:00.000Z',
      last_seen_at: '2026-08-04T00:59:00.000Z',
    },
  });
  assert.equal(audit.ready, false);
  assert.equal(audit.missing.length, 1);
  assert.equal(audit.delayed.length, 1);
  assert.equal(audit.heartbeatHealthy, false);
  assert.equal(audit.restartedAfterObservationStart, true);
  assert.match(formatShadowAudit(audit), /관찰 시작 후 재기동 감지/);
});
