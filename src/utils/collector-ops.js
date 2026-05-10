const { selectRows } = require('./persistence');

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function countBy(items, getKey) {
  return (items || []).reduce((acc, item) => {
    const key = getKey(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function sum(items, getValue) {
  return (items || []).reduce((acc, item) => {
    const value = Number(getValue(item) || 0);
    return acc + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function startIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function getKstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return {
    weekday: parts.find(part => part.type === 'weekday')?.value,
    hour: Number(parts.find(part => part.type === 'hour')?.value),
  };
}

function isCollectorExpectedNow(date = new Date()) {
  const { weekday, hour } = getKstParts(date);
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  return isWeekday && hour >= 7 && hour <= 23;
}

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isResolvedCollectorFailure(run = {}) {
  const message = String(run.error_message || '').toLowerCase();
  const trigger = String(run.trigger_source || '').toLowerCase();
  return (
    message.includes('stale run cleaned')
    || message.includes("cannot access 'toadd' before initialization")
    || message.includes('manual smoke')
    || trigger.startsWith('codex_')
  );
}

function summarizeCollectorOps(runs = [], alerts = [], options = {}) {
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const expectedRuns = options.expectedRuns !== false;
  const recentAlertFailureMs = (options.recentAlertFailureHours ?? 24) * 60 * 60 * 1000;
  const completed = runs.filter(run => run.status !== 'running');
  const success = runs.filter(run => run.status === 'success');
  const failed = runs.filter(run => run.status === 'failed');
  const resolvedFailures = failed.filter(isResolvedCollectorFailure);
  const actionableFailures = failed.filter(run => !isResolvedCollectorFailure(run));
  const operationalRuns = runs.filter(run => !(run.status === 'failed' && isResolvedCollectorFailure(run)));
  const operationalCompleted = success.length + actionableFailures.length;
  const lookbacks = runs
    .filter(run => !(run.status === 'failed' && isResolvedCollectorFailure(run)))
    .map(run => Number(run.lookback_minutes))
    .filter(value => Number.isFinite(value));
  const alertByTypeStatus = countBy(alerts, alert => `${alert.alert_type || 'unknown'}:${alert.status || 'unknown'}`);
  const failedImmediateAlerts = alerts.filter(alert => alert.alert_type === 'immediate' && alert.status === 'failed');
  const recentFailedImmediateAlerts = failedImmediateAlerts.filter(alert => {
    const created = toTime(alert.created_at || alert.sent_at);
    return created && now - created <= recentAlertFailureMs;
  });
  const historicalFailedImmediateAlerts = failedImmediateAlerts.filter(alert => !recentFailedImmediateAlerts.includes(alert));

  const healthLabel = runs.length === 0
    ? (expectedRuns ? 'empty' : 'idle')
    : (actionableFailures.length > 0
      ? (success.length > actionableFailures.length ? 'warn' : 'failed')
      : 'ok');

  return {
    totalRuns: runs.length,
    completedRuns: completed.length,
    operationalRuns: operationalRuns.length,
    operationalCompletedRuns: operationalCompleted,
    successfulRuns: success.length,
    failedRuns: failed.length,
    actionableFailedRuns: actionableFailures.length,
    resolvedFailureRuns: resolvedFailures.length,
    successRatePct: operationalCompleted ? round((success.length / operationalCompleted) * 100) : null,
    triggerSources: countBy(runs, run => run.trigger_source),
    avgLookbackMinutes: lookbacks.length ? round(sum(lookbacks, value => value) / lookbacks.length) : null,
    maxLookbackMinutes: lookbacks.length ? Math.max(...lookbacks) : null,
    totalNewArticles: sum(runs, run => run.new_article_count),
    totalImmediateAlerts: sum(runs, run => run.immediate_alert_count),
    totalDigestBuffered: sum(runs, run => run.digest_buffer_count),
    alertEvents: {
      total: alerts.length,
      sentImmediate: alertByTypeStatus['immediate:sent'] || 0,
      failedImmediate: alertByTypeStatus['immediate:failed'] || 0,
      actionableFailedImmediate: recentFailedImmediateAlerts.length,
      historicalFailedImmediate: historicalFailedImmediateAlerts.length,
      sentDigest: alertByTypeStatus['digest:sent'] || 0,
      failedDigest: alertByTypeStatus['digest:failed'] || 0,
      bufferedDigest: alertByTypeStatus['digest:buffered'] || 0,
      pendingDigest: (alertByTypeStatus['digest:pending'] || 0) + (alertByTypeStatus['digest:buffered'] || 0),
      sentCatchUp: alertByTypeStatus['catch_up:sent'] || 0,
      failedCatchUp: alertByTypeStatus['catch_up:failed'] || 0,
      bufferedCatchUp: alertByTypeStatus['catch_up:buffered'] || 0,
      pendingCatchUp: (alertByTypeStatus['catch_up:pending'] || 0) + (alertByTypeStatus['catch_up:buffered'] || 0),
    },
    recentFailures: actionableFailures.slice(0, 3).map(run => ({
      startedAt: run.started_at,
      triggerSource: run.trigger_source,
      errorMessage: run.error_message || '',
    })),
    resolvedFailures: resolvedFailures.slice(0, 3).map(run => ({
      startedAt: run.started_at,
      triggerSource: run.trigger_source,
      errorMessage: run.error_message || '',
    })),
    expectedRuns,
    healthLabel,
  };
}

function buildCollectorOpsAnomalies(summary = {}, options = {}) {
  const maxFailedRuns = options.maxFailedRuns ?? 0;
  const minSuccessRatePct = options.minSuccessRatePct ?? 90;
  const maxPendingCatchUp = options.maxPendingCatchUp ?? 20;
  const maxFailedImmediate = options.maxFailedImmediate ?? 0;
  const maxLookbackMinutes = options.maxLookbackMinutes ?? 90;
  const anomalies = [];

  if ((summary.totalRuns || 0) === 0 && summary.expectedRuns !== false) {
    anomalies.push('최근 수집 실행 기록이 없습니다');
  }
  const actionableFailedRuns = summary.actionableFailedRuns ?? summary.failedRuns ?? 0;
  if (actionableFailedRuns > maxFailedRuns) {
    anomalies.push(`조치 필요 수집 실패 ${actionableFailedRuns}건`);
  }
  if (
    typeof summary.successRatePct === 'number'
    && summary.completedRuns >= 3
    && summary.successRatePct < minSuccessRatePct
  ) {
    anomalies.push(`수집 성공률 ${summary.successRatePct}%`);
  }
  const actionableFailedImmediate = summary.alertEvents?.actionableFailedImmediate ?? summary.alertEvents?.failedImmediate ?? 0;
  if (actionableFailedImmediate > maxFailedImmediate) {
    anomalies.push(`최근 즉시 알림 실패 ${actionableFailedImmediate}건`);
  }
  if ((summary.alertEvents?.failedDigest || 0) > 0) {
    anomalies.push(`다이제스트 상태 전환 실패 ${summary.alertEvents.failedDigest}건`);
  }
  if ((summary.alertEvents?.failedCatchUp || 0) > 0) {
    anomalies.push(`catch-up 상태 전환 실패 ${summary.alertEvents.failedCatchUp}건`);
  }
  if ((summary.alertEvents?.pendingCatchUp || 0) > maxPendingCatchUp) {
    anomalies.push(`catch-up 대기 ${summary.alertEvents.pendingCatchUp}건`);
  }
  if (
    (summary.maxLookbackMinutes || 0) > maxLookbackMinutes
    && (
      (summary.actionableFailedRuns || 0) > 0
      || (summary.alertEvents?.pendingCatchUp || 0) > maxPendingCatchUp
    )
  ) {
    anomalies.push(`최대 lookback ${summary.maxLookbackMinutes}분`);
  }

  return anomalies;
}

async function buildCollectorOpsSummary({ days = 7 } = {}) {
  const since = startIso(days);
  const expectedRuns = days > 1 || isCollectorExpectedNow();
  const [runResult, alertResult] = await Promise.all([
    selectRows('collector_runs', {
      select: '*',
      started_at: `gte.${since}`,
      order: 'started_at.desc',
      limit: '500',
    }),
    selectRows('alert_events', {
      select: 'article_id,alert_type,status,sent_at,created_at',
      created_at: `gte.${since}`,
      order: 'created_at.desc',
      limit: '1000',
    }),
  ]);

  return summarizeCollectorOps(runResult.rows || [], alertResult.rows || [], { expectedRuns });
}

module.exports = {
  summarizeCollectorOps,
  buildCollectorOpsAnomalies,
  buildCollectorOpsSummary,
  isResolvedCollectorFailure,
  isCollectorExpectedNow,
};
