const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeCollectorOps, buildCollectorOpsAnomalies } = require('../src/utils/collector-ops');
const { parseArgs, formatSummary } = require('../scripts/collector-ops-report');

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
    { alert_type: 'immediate', status: 'failed', created_at: '2026-05-10T00:00:00.000Z' },
    { alert_type: 'digest', status: 'sent' },
    { alert_type: 'digest', status: 'pending' },
    { alert_type: 'digest', status: 'buffered' },
    { alert_type: 'catch_up', status: 'sent' },
    { alert_type: 'catch_up', status: 'buffered' },
  ], { now: '2026-05-10T12:00:00.000Z' });

  assert.equal(summary.totalRuns, 2);
  assert.equal(summary.successfulRuns, 1);
  assert.equal(summary.failedRuns, 1);
  assert.equal(summary.actionableFailedRuns, 1);
  assert.equal(summary.resolvedFailureRuns, 0);
  assert.equal(summary.successRatePct, 50);
  assert.equal(summary.avgLookbackMinutes, 37.5);
  assert.equal(summary.alertEvents.sentDigest, 1);
  assert.equal(summary.alertEvents.actionableFailedImmediate, 1);
  assert.equal(summary.alertEvents.historicalFailedImmediate, 0);
  assert.equal(summary.alertEvents.pendingDigest, 2);
  assert.equal(summary.alertEvents.sentCatchUp, 1);
  assert.equal(summary.alertEvents.pendingCatchUp, 1);
  assert.equal(summary.healthLabel, 'failed');
});

test('summarizeCollectorOps separates historical immediate alert failures', () => {
  const summary = summarizeCollectorOps([
    {
      status: 'success',
      trigger_source: 'cloud_scheduler',
      lookback_minutes: 240,
    },
  ], [
    { alert_type: 'immediate', status: 'failed', created_at: '2026-05-07T00:00:00.000Z' },
  ], { now: '2026-05-10T12:00:00.000Z' });

  assert.equal(summary.alertEvents.failedImmediate, 1);
  assert.equal(summary.alertEvents.actionableFailedImmediate, 0);
  assert.equal(summary.alertEvents.historicalFailedImmediate, 1);
  assert.deepEqual(buildCollectorOpsAnomalies(summary), []);
});

test('summarizeCollectorOps separates resolved stale smoke failures from actionable failures', () => {
  const summary = summarizeCollectorOps([
    {
      status: 'success',
      trigger_source: 'cloud_scheduler',
      lookback_minutes: 30,
    },
    {
      status: 'failed',
      trigger_source: 'codex_smoke',
      lookback_minutes: 240,
      error_message: 'stale run cleaned after Cloud Run memory redeploy',
    },
    {
      status: 'failed',
      trigger_source: 'github_actions_backup',
      lookback_minutes: 30,
      error_message: "Cannot access 'toAdd' before initialization",
    },
  ], []);

  assert.equal(summary.failedRuns, 2);
  assert.equal(summary.actionableFailedRuns, 0);
  assert.equal(summary.resolvedFailureRuns, 2);
  assert.equal(summary.healthLabel, 'ok');
  assert.deepEqual(buildCollectorOpsAnomalies(summary, { maxLookbackMinutes: 300 }), []);
});

test('summarizeCollectorOps marks empty run windows explicitly', () => {
  const summary = summarizeCollectorOps([], []);

  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.healthLabel, 'empty');
  assert.deepEqual(buildCollectorOpsAnomalies(summary), ['최근 수집 실행 기록이 없습니다']);
});

test('buildCollectorOpsAnomalies flags unhealthy collector state', () => {
  const anomalies = buildCollectorOpsAnomalies({
    totalRuns: 5,
    completedRuns: 5,
    failedRuns: 1,
    successRatePct: 80,
    maxLookbackMinutes: 120,
    alertEvents: {
      failedImmediate: 1,
      actionableFailedImmediate: 1,
      failedDigest: 1,
      failedCatchUp: 1,
      pendingCatchUp: 2,
    },
  }, { maxPendingCatchUp: 0 });

  assert.deepEqual(anomalies, [
    '조치 필요 수집 실패 1건',
    '수집 성공률 80%',
    '최근 즉시 알림 실패 1건',
    '다이제스트 상태 전환 실패 1건',
    'catch-up 상태 전환 실패 1건',
    'catch-up 대기 2건',
    '최대 lookback 120분',
  ]);
});

test('collector ops args support noTelegram and explicit days', () => {
  assert.deepEqual(parseArgs(['--noTelegram'], {}), { days: 1, noTelegram: true });
  assert.deepEqual(parseArgs(['--days', '7'], {}), { days: 7, noTelegram: false });
  assert.deepEqual(parseArgs(['--days=3', '--no-telegram'], {}), { days: 3, noTelegram: true });
});

test('collector ops summary includes anomalies and alert counts', () => {
  const message = formatSummary({
    healthLabel: 'warn',
    totalRuns: 5,
    completedRuns: 5,
    successfulRuns: 4,
    failedRuns: 1,
    successRatePct: 80,
    maxLookbackMinutes: 120,
    totalNewArticles: 10,
    totalImmediateAlerts: 1,
    totalDigestBuffered: 3,
    alertEvents: {
      pendingDigest: 2,
      pendingCatchUp: 1,
    },
  }, ['수집 성공률 80%']);

  assert.match(message, /수집기 운영 점검/);
  assert.match(message, /성공 4\/5/);
  assert.match(message, /조치 필요 실패 1/);
  assert.match(message, /즉시알림 실패: 최근 0/);
  assert.match(message, /알림대기: digest 2 · catch-up 1/);
  assert.match(message, /수집 성공률 80%/);
});
