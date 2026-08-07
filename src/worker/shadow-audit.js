const { enumerateDueOccurrences, PC_WORKER_JOBS } = require('./pc-scheduler');

const DEFAULT_TARGET_HOURS = 72;
const DEFAULT_GRACE_MINUTES = 2;
const DEFAULT_MAX_DELAY_MINUTES = 10;

function finiteDate(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime()) ? date : null;
}

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function auditShadowObservation(options = {}) {
  const now = finiteDate(options.now) || new Date();
  const startedAt = finiteDate(options.startedAt);
  if (!startedAt) throw new Error('PC_WORKER_SHADOW_STARTED_AT is required');
  if (startedAt > now) throw new Error('shadow start cannot be in the future');
  const env = options.env || {};
  const jobs = (options.jobs || PC_WORKER_JOBS)
    .filter(job => !job.enabledEnv || String(env[job.enabledEnv]).toLowerCase() === 'true');
  const targetHours = Math.max(1, Number(options.targetHours || DEFAULT_TARGET_HOURS));
  const graceMinutes = Math.max(0, Number(options.graceMinutes ?? DEFAULT_GRACE_MINUTES));
  const maxDelayMinutes = Math.max(1, Number(options.maxDelayMinutes || DEFAULT_MAX_DELAY_MINUTES));
  const cutoff = new Date(now.getTime() - graceMinutes * 60_000);
  const observationMinutes = Math.ceil((cutoff.getTime() - startedAt.getTime()) / 60_000) + 1;
  const auditJobs = jobs.map(job => ({ ...job, catchUpMinutes: observationMinutes }));
  const expected = enumerateDueOccurrences({
    jobs: auditJobs,
    after: startedAt,
    now: cutoff,
    maxCatchUpMinutes: observationMinutes,
  });
  const relevantRuns = (options.runs || []).filter(run => {
    const scheduled = finiteDate(run.scheduled_for);
    return scheduled && scheduled > startedAt && scheduled <= cutoff && run.mode === 'shadow';
  });
  const byId = new Map(relevantRuns.map(run => [String(run.id), run]));
  const missing = expected.filter(item => !byId.has(item.id));
  const nonShadowDue = relevantRuns.filter(run => run.status !== 'shadow_due');
  const delayed = relevantRuns.map(run => {
    const scheduled = finiteDate(run.scheduled_for);
    const finished = finiteDate(run.finished_at);
    return {
      ...run,
      delayMinutes: scheduled && finished ? (finished.getTime() - scheduled.getTime()) / 60_000 : null,
    };
  }).filter(run => run.delayMinutes !== null && run.delayMinutes > maxDelayMinutes);
  const heartbeat = options.heartbeat || null;
  const lastSeen = finiteDate(heartbeat?.last_seen_at);
  const heartbeatAgeMinutes = lastSeen ? (now.getTime() - lastSeen.getTime()) / 60_000 : null;
  const workerStartedAt = finiteDate(heartbeat?.started_at);
  const currentWorkerUptimeHours = workerStartedAt
    ? Math.max(0, (now.getTime() - workerStartedAt.getTime()) / 3_600_000)
    : null;
  const restartedAfterObservationStart = Boolean(
    workerStartedAt
    && workerStartedAt.getTime() > startedAt.getTime() + graceMinutes * 60_000
  );
  const heartbeatHealthy = Boolean(
    heartbeat
    && heartbeat.mode === 'shadow'
    && heartbeat.gateway_connected === true
    && heartbeatAgeMinutes !== null
    && heartbeatAgeMinutes <= 3,
  );
  const elapsedHours = (now.getTime() - startedAt.getTime()) / 3_600_000;
  const observationComplete = elapsedHours >= targetHours;
  const ready = observationComplete
    && heartbeatHealthy
    && missing.length === 0
    && nonShadowDue.length === 0
    && delayed.length === 0;
  return {
    ready,
    observationComplete,
    startedAt: startedAt.toISOString(),
    targetHours,
    maxDelayMinutes,
    elapsedHours: round(elapsedHours),
    remainingHours: round(Math.max(0, targetHours - elapsedHours)),
    expectedCount: expected.length,
    recordedCount: relevantRuns.length,
    missing,
    nonShadowDue,
    delayed,
    maxObservedDelayMinutes: round(Math.max(0, ...relevantRuns.map(run => {
      const scheduled = finiteDate(run.scheduled_for);
      const finished = finiteDate(run.finished_at);
      return scheduled && finished ? (finished.getTime() - scheduled.getTime()) / 60_000 : 0;
    }))),
    heartbeatHealthy,
    heartbeatAgeMinutes: heartbeatAgeMinutes === null ? null : round(heartbeatAgeMinutes),
    currentWorkerUptimeHours: currentWorkerUptimeHours === null ? null : round(currentWorkerUptimeHours),
    restartedAfterObservationStart,
  };
}

function formatShadowAudit(audit) {
  const status = audit.ready ? '전환 준비 완료' : (audit.observationComplete ? '점검 필요' : '관찰 중');
  return [
    `🧪 **PC Worker Shadow · ${status}**`,
    '',
    `관찰: ${audit.elapsedHours}/${audit.targetHours}시간 · 남음 ${audit.remainingHours}시간`,
    `스케줄: 기대 ${audit.expectedCount} · 기록 ${audit.recordedCount} · 누락 ${audit.missing.length}`,
    `상태 오류 ${audit.nonShadowDue.length} · ${audit.maxDelayMinutes}분 초과 지연 ${audit.delayed.length} · 최대 지연 ${audit.maxObservedDelayMinutes}분`,
    `Heartbeat/Gateway: ${audit.heartbeatHealthy ? '정상' : '점검 필요'}`,
    ...(audit.currentWorkerUptimeHours === null
      ? []
      : [`현재 worker 연속 실행: ${audit.currentWorkerUptimeHours}시간${audit.restartedAfterObservationStart ? ' · 관찰 시작 후 재기동 감지' : ''}`]),
    '',
    audit.ready
      ? 'active 전환 전 최종 증분 동기화와 백업 검증을 진행할 수 있습니다.'
      : (audit.observationComplete
        ? '누락·지연·Gateway 상태를 해소한 뒤 관찰 판정을 다시 실행하세요.'
        : '72시간이 끝나기 전에는 active 전환과 cloud 안전망 중지를 하지 않습니다.'),
  ].join('\n');
}

module.exports = {
  DEFAULT_GRACE_MINUTES,
  DEFAULT_MAX_DELAY_MINUTES,
  DEFAULT_TARGET_HOURS,
  auditShadowObservation,
  finiteDate,
  formatShadowAudit,
};
