const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeCollectorOps } = require('../src/utils/collector-ops');

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
    { alert_type: 'catch_up', status: 'pending' },
  ]);

  assert.equal(summary.totalRuns, 2);
  assert.equal(summary.successfulRuns, 1);
  assert.equal(summary.failedRuns, 1);
  assert.equal(summary.successRatePct, 50);
  assert.equal(summary.avgLookbackMinutes, 37.5);
  assert.equal(summary.alertEvents.pendingCatchUp, 1);
  assert.equal(summary.healthLabel, 'failed');
});
