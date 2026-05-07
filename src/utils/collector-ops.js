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

function summarizeCollectorOps(runs = [], alerts = []) {
  const completed = runs.filter(run => run.status !== 'running');
  const success = runs.filter(run => run.status === 'success');
  const failed = runs.filter(run => run.status === 'failed');
  const lookbacks = runs
    .map(run => Number(run.lookback_minutes))
    .filter(value => Number.isFinite(value));
  const alertByTypeStatus = countBy(alerts, alert => `${alert.alert_type || 'unknown'}:${alert.status || 'unknown'}`);

  const healthLabel = failed.length > 0
    ? (success.length > failed.length ? 'warn' : 'failed')
    : 'ok';

  return {
    totalRuns: runs.length,
    completedRuns: completed.length,
    successfulRuns: success.length,
    failedRuns: failed.length,
    successRatePct: completed.length ? round((success.length / completed.length) * 100) : null,
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
      pendingDigest: alertByTypeStatus['digest:pending'] || 0,
      pendingCatchUp: alertByTypeStatus['catch_up:pending'] || 0,
    },
    recentFailures: failed.slice(0, 3).map(run => ({
      startedAt: run.started_at,
      triggerSource: run.trigger_source,
      errorMessage: run.error_message || '',
    })),
    healthLabel,
  };
}

async function buildCollectorOpsSummary({ days = 7 } = {}) {
  const since = startIso(days);
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

  return summarizeCollectorOps(runResult.rows || [], alertResult.rows || []);
}

module.exports = {
  summarizeCollectorOps,
  buildCollectorOpsSummary,
};
