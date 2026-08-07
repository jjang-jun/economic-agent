const { fetchPolicyDocuments, enrichPolicyEventDetails } = require('../sources/policy-fetcher');
const { fetchAssemblyPolicyDocuments } = require('../sources/assembly-bills');
const { fetchLawPolicyDocuments } = require('../sources/law-open-data');
const { classifyPolicyDocuments } = require('../utils/policy-classifier');
const {
  loadPolicyEventState,
  savePolicyEvents,
  markPolicyEventsNotified,
  pendingPolicyEvents,
} = require('../utils/policy-event-store');
const { sendPolicyRadarReport, formatPolicyRadarReport } = require('../notify/policy-report');
const { tryAcquireJobLock, releaseJobLock } = require('../utils/persistence');

function uniqueEvents(events = []) {
  const byId = new Map();
  for (const event of events) {
    if (event?.id) byId.set(event.id, event);
  }
  return [...byId.values()];
}

function numericOption(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function wait(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

async function fetchAllPolicySources(options = {}) {
  const rssFetched = await (options.fetchDocuments || fetchPolicyDocuments)(options.fetchOptions || {});
  const assemblyFetched = await (
    options.fetchAssemblyDocuments || fetchAssemblyPolicyDocuments
  )(options.assemblyOptions || {});
  const lawFetched = await (
    options.fetchLawDocuments || fetchLawPolicyDocuments
  )(options.lawOptions || {});
  return {
    documents: [
      ...rssFetched.documents,
      ...(assemblyFetched.documents || []),
      ...(lawFetched.documents || []),
    ],
    sourceResults: [
      ...rssFetched.sourceResults,
      ...(assemblyFetched.sourceResults || []),
      ...(lawFetched.sourceResults || []),
    ],
  };
}

async function fetchPolicySourcesWithOutageRetry(options = {}) {
  const retryCount = numericOption(
    options.allSourcesRetryCount ?? process.env.POLICY_ALL_SOURCES_RETRY_COUNT,
    1, 0, 3
  );
  const retryDelayMs = numericOption(
    options.allSourcesRetryDelayMs ?? process.env.POLICY_ALL_SOURCES_RETRY_DELAY_MS,
    15_000, 0, 120_000
  );
  let fetched;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    fetched = await fetchAllPolicySources(options);
    if (fetched.sourceResults.some(source => source.ok)) return fetched;
    if (attempt < retryCount) {
      console.warn(`[정책레이더] 모든 공식 소스 실패 · ${retryDelayMs}ms 후 전체 재시도 ${attempt + 1}/${retryCount}`);
      await (options.wait || wait)(retryDelayMs);
    }
  }
  return fetched;
}

function eventTime(event) {
  const value = Date.parse(event.publishedAt || '');
  return Number.isFinite(value) ? value : 0;
}

function isBootstrapRecent(event, now, hours) {
  const publishedAt = eventTime(event);
  if (!publishedAt) return true;
  return publishedAt >= now.getTime() - (hours * 60 * 60 * 1000);
}

function selectPolicyNotifications(events, existingById, options = {}) {
  const now = options.now || new Date();
  const bootstrapHours = Math.max(1, Number(options.bootstrapHours || 72));
  const maxEvents = Math.max(1, Number(options.maxEvents || 10));
  const pending = pendingPolicyEvents(events, existingById)
    .sort((a, b) => eventTime(b) - eventTime(a));
  const baseline = [];
  const notify = [];

  for (const event of pending) {
    const isNew = !existingById.has(event.id);
    if (isNew && !isBootstrapRecent(event, now, bootstrapHours)) {
      baseline.push(event);
    } else if (notify.length < maxEvents) {
      notify.push(event);
    }
  }
  return { pending, notify, baseline };
}

async function runPolicyRadar(options = {}) {
  const now = options.now || new Date();
  const jobName = 'policy-radar';
  const shouldSkipLock = options.skipLock || options.dryRun;
  const lock = shouldSkipLock
    ? { acquired: true }
    : await tryAcquireJobLock(jobName, {
        ttlSeconds: 15 * 60,
        lockedBy: options.triggerSource || 'cli',
      });
  if (!lock.acquired) {
    return { ok: true, skipped: true, reason: 'job_locked', lockedUntil: lock.lockedUntil };
  }

  try {
    const fetched = await fetchPolicySourcesWithOutageRetry(options);
    const successfulSourceCount = fetched.sourceResults.filter(source => source.ok).length;
    fetched.sourceResults
      .filter(source => !source.ok)
      .forEach(source => console.warn(`[정책레이더] ${source.id} 수집 실패: ${source.error}`));
    if (successfulSourceCount === 0) {
      throw new Error('모든 공식 정책 소스 수집 실패');
    }

    const events = uniqueEvents(classifyPolicyDocuments(fetched.documents));
    const stored = options.dryRun
      ? { byId: new Map(), source: 'dry_run' }
      : await loadPolicyEventState(events);
    const selection = selectPolicyNotifications(events, stored.byId, {
      now,
      bootstrapHours: options.bootstrapHours || process.env.POLICY_RADAR_BOOTSTRAP_HOURS || 72,
      maxEvents: options.maxEvents || process.env.POLICY_RADAR_MAX_EVENTS || 10,
    });
    const enrichedNotifications = await (
      options.enrichEvents || enrichPolicyEventDetails
    )(selection.notify, options.detailOptions || {});
    const report = {
      generatedAt: now.toISOString(),
      events: enrichedNotifications,
      sourceResults: fetched.sourceResults,
      successfulSourceCount,
      fetchedCount: fetched.documents.length,
      relevantCount: events.length,
      baselineCount: selection.baseline.length,
      pendingCount: selection.pending.length,
    };

    console.log(
      `[정책레이더] 소스 ${successfulSourceCount}/${fetched.sourceResults.length} · 수집 ${fetched.documents.length}건 · 관련 ${events.length}건 · 신규/변경 ${selection.pending.length}건`
    );

    if (options.dryRun) {
      if (report.events.length > 0 || options.includeEmpty) console.log(formatPolicyRadarReport(report));
      return { ok: true, dryRun: true, ...report };
    }

    await savePolicyEvents(events, stored.byId, { now: now.toISOString() });
    if (selection.baseline.length > 0) {
      await markPolicyEventsNotified(selection.baseline, stored.byId, { now: now.toISOString() });
      console.log(`[정책레이더] 첫 실행 과거 문서 ${selection.baseline.length}건 기준선 처리`);
    }

    if (report.events.length === 0 && !options.includeEmpty) {
      console.log('[정책레이더] 새로 알릴 공식 정책 변경 없음');
      return { ok: true, sent: false, ...report };
    }

    if (options.noReport) {
      console.log(formatPolicyRadarReport(report));
      return { ok: true, sent: false, preview: true, ...report };
    }

    await (options.sendReport || sendPolicyRadarReport)(report);
    await markPolicyEventsNotified(report.events, stored.byId, { now: now.toISOString() });
    console.log(`[정책레이더] Discord ${report.events.length}건 전송 완료`);
    return { ok: true, sent: true, ...report };
  } finally {
    if (!shouldSkipLock) await releaseJobLock(jobName);
  }
}

module.exports = {
  fetchAllPolicySources,
  fetchPolicySourcesWithOutageRetry,
  uniqueEvents,
  isBootstrapRecent,
  selectPolicyNotifications,
  runPolicyRadar,
};
