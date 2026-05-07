const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeCollectorOps, buildCollectorOpsAnomalies } = require('../src/utils/collector-ops');

test('summarizeCollectorOps reports run health and pending alerts', () => {
  const summary = summarizeCollectorOps([
    {
      status: 'success',
      trigger_source: 'cloud_scheduler',
      lookback_minutes: 30,
      new_article_count: 10,
      immediate_alert_count: 2,
      digest_buffer_count: 4,
    },
    {
      status: 'failed',
      trigger_source: 'github_actions_backup',
      lookback_minutes: 45,
      error_message: 'timeout',
    },
  ], [
    { alert_type: 'immediate', status: 'sent' },
    { alert_type: 'immediate', status: 'failed' },
    { alert_type: 'digest', status: 'pending' },
    { alert_type: 'digest', status: 'buffered' },
    { alert_type: 'catch_up', status: 'buffered' },
  ]);

  assert.equal(summary.totalRuns, 2);
  assert.equal(summary.successfulRuns, 1);
  assert.equal(summary.failedRuns, 1);
  assert.equal(summary.successRatePct, 50);
  assert.equal(summary.avgLookbackMinutes, 37.5);
  assert.equal(summary.alertEvents.pendingDigest, 2);
  assert.equal(summary.alertEvents.pendingCatchUp, 1);
  assert.equal(summary.healthLabel, 'failed');
});

test('buildCollectorOpsAnomalies flags unhealthy collector state', () => {
  const anomalies = buildCollectorOpsAnomalies({
    completedRuns: 5,
    failedRuns: 1,
    successRatePct: 80,
    maxLookbackMinutes: 120,
    alertEvents: {
      failedImmediate: 1,
      pendingCatchUp: 2,
    },
  }, { maxPendingCatchUp: 0 });

  assert.deepEqual(anomalies, [
    '수집 실패 1건',
    '수집 성공률 80%',
    '즉시 알림 실패 1건',
    'catch-up 대기 2건',
    '최대 lookback 120분',
  ]);
});
