const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  loadWorkerJobRun,
  persistWorkerHeartbeat,
  persistWorkerJobRun,
  releaseJobLock,
  tryAcquireJobLock,
} = require('../utils/persistence');
const { sendReport } = require('../notify/reports');
const { version: PACKAGE_VERSION } = require('../../package.json');

const KST_TIME_ZONE = 'Asia/Seoul';
const TERMINAL_STATUSES = new Set(['success', 'shadow_due', 'skipped_locked']);
const VALID_MODES = new Set(['off', 'shadow', 'active']);
const DEFAULT_TICK_MS = 15_000;
const DEFAULT_HEARTBEAT_MS = 60_000;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MAX_CATCH_UP_MINUTES = 240;

function atTime(hour, minute, options = {}) {
  return parts => (
    (!options.weekdays || (parts.weekday >= 1 && parts.weekday <= 5))
    && (!options.daysOfWeek || options.daysOfWeek.includes(parts.weekday))
    && (!options.dayOfMonth || options.dayOfMonth === parts.day)
    && parts.hour === hour
    && parts.minute === minute
  );
}

function intradayQuarterHour(parts) {
  return parts.weekday >= 1
    && parts.weekday <= 5
    && [5, 20, 35, 50].includes(parts.minute)
    && ((parts.hour >= 9 && parts.hour <= 14) || (parts.hour === 15 && parts.minute <= 20));
}

function everyFiveMinutes(parts) {
  return parts.minute % 5 === 0;
}

const PC_WORKER_JOBS = Object.freeze([
  { id: 'database-backup', script: 'home:db:backup', when: atTime(2, 30), catchUpMinutes: 360, timeoutMinutes: 20, enabledEnv: 'HOME_DB_SCHEDULED_BACKUP_ENABLED' },
  { id: 'real-estate-daily', script: 'real-estate:collect', when: atTime(3, 20), catchUpMinutes: 1_440, timeoutMinutes: 45, enabledEnv: 'REAL_ESTATE_COLLECTION_ENABLED' },
  { id: 'real-estate-listings-daily', script: 'real-estate:listings:collect', when: atTime(3, 50), catchUpMinutes: 1_440, timeoutMinutes: 20, enabledEnv: 'REAL_ESTATE_LISTING_COLLECTION_ENABLED' },
  { id: 'real-estate-reb-weekly', script: 'real-estate:reb:collect', when: atTime(4, 10, { daysOfWeek: [1] }), catchUpMinutes: 1_440, timeoutMinutes: 30, enabledEnv: 'REB_REAL_ESTATE_COLLECTION_ENABLED' },
  { id: 'news-collector', script: 'collector:scheduled', when: everyFiveMinutes, catchUpMinutes: 20, timeoutMinutes: 8 },
  { id: 'worker-status-report', script: 'worker:status-report', when: atTime(8, 5, { weekdays: true }), catchUpMinutes: 60 },
  { id: 'discord-smoke', script: 'discord:smoke', args: ['--channel=ops'], when: atTime(8, 10, { weekdays: true }), catchUpMinutes: 30 },
  { id: 'digest-preopen', script: 'digest', args: ['preopen'], when: atTime(8, 20, { weekdays: true }), catchUpMinutes: 45 },
  { id: 'timing-premarket', script: 'timing:alert', args: ['premarket'], when: atTime(8, 45, { weekdays: true }), catchUpMinutes: 20 },
  { id: 'timing-intraday', script: 'timing:alert', args: ['intraday'], when: intradayQuarterHour, catchUpMinutes: 12 },
  { id: 'pre-news-signal', script: 'pre-news:signal', when: intradayQuarterHour, catchUpMinutes: 12 },
  { id: 'policy-radar-am', script: 'policy:radar', when: atTime(10, 10, { weekdays: true }), catchUpMinutes: 90 },
  { id: 'digest-midday', script: 'digest', args: ['midday'], when: atTime(11, 50, { weekdays: true }), catchUpMinutes: 45 },
  { id: 'collector-ops-midday', script: 'collector:ops-report', when: atTime(12, 5, { weekdays: true }), catchUpMinutes: 90 },
  { id: 'digest-close', script: 'digest', args: ['close'], when: atTime(15, 45, { weekdays: true }), catchUpMinutes: 45 },
  { id: 'stock-report', script: 'report', when: atTime(16, 0, { weekdays: true }), catchUpMinutes: 120, timeoutMinutes: 15 },
  { id: 'portfolio-snapshot', script: 'portfolio:snapshot', when: atTime(16, 10, { weekdays: true }), catchUpMinutes: 120 },
  { id: 'freedom-report', script: 'freedom:report', args: ['--discord'], when: atTime(16, 20, { daysOfWeek: [5] }), catchUpMinutes: 180 },
  { id: 'action-report', script: 'action:report', when: atTime(16, 25, { weekdays: true }), catchUpMinutes: 120 },
  { id: 'digest-europe', script: 'digest', args: ['europe'], when: atTime(17, 10, { weekdays: true }), catchUpMinutes: 45 },
  { id: 'evaluate-recommendations', script: 'evaluate', when: atTime(17, 30, { weekdays: true }), catchUpMinutes: 180 },
  { id: 'evaluate-market-anomalies', script: 'anomaly:evaluate', when: atTime(17, 35, { weekdays: true }), catchUpMinutes: 180 },
  { id: 'trade-performance', script: 'trade:performance', when: atTime(17, 40, { daysOfWeek: [5] }), catchUpMinutes: 180 },
  { id: 'policy-radar-pm', script: 'policy:radar', when: atTime(18, 10, { weekdays: true }), catchUpMinutes: 120 },
  { id: 'review-weekly', script: 'review:weekly', when: atTime(18, 10, { daysOfWeek: [5] }), catchUpMinutes: 360, timeoutMinutes: 15 },
  { id: 'review-monthly', script: 'review:monthly', when: atTime(18, 20, { dayOfMonth: 1 }), catchUpMinutes: 1_440, timeoutMinutes: 20 },
  { id: 'digest-usopen', script: 'digest', args: ['usopen'], when: atTime(22, 40, { weekdays: true }), catchUpMinutes: 45 },
  { id: 'collector-ops-night', script: 'collector:ops-report', when: atTime(23, 50, { weekdays: true }), catchUpMinutes: 120 },
  { id: 'price-provider-ops', script: 'price-provider:ops-report', when: atTime(23, 55, { weekdays: true }), catchUpMinutes: 120 },
  { id: 'security-audit', script: 'security:audit', when: atTime(9, 10, { daysOfWeek: [0] }), catchUpMinutes: 360 },
]);

function parseSchedulerMode(value, fallback = 'shadow') {
  const mode = String(value || fallback).trim().toLowerCase();
  if (!VALID_MODES.has(mode)) throw new Error(`Invalid PC_WORKER_SCHEDULER_MODE: ${mode}`);
  return mode;
}

function floorMinute(date) {
  const value = new Date(date);
  value.setUTCSeconds(0, 0);
  return value;
}

function getKstParts(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(item => [item.type, item.value]));
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday,
  };
}

function occurrenceId(jobId, scheduledFor) {
  return `${jobId}:${floorMinute(scheduledFor).toISOString()}`;
}

function enumerateDueOccurrences(options = {}) {
  const jobs = options.jobs || PC_WORKER_JOBS;
  const now = floorMinute(options.now || new Date());
  const start = floorMinute(options.after || new Date(now.getTime() - 60_000));
  const maxCatchUpMinutes = Math.max(1, Number(options.maxCatchUpMinutes || DEFAULT_MAX_CATCH_UP_MINUTES));
  const boundedStart = new Date(Math.max(start.getTime(), now.getTime() - maxCatchUpMinutes * 60_000));
  const occurrences = [];
  for (let cursor = new Date(boundedStart.getTime() + 60_000); cursor <= now; cursor = new Date(cursor.getTime() + 60_000)) {
    const parts = getKstParts(cursor);
    for (const job of jobs) {
      if (!job.when(parts)) continue;
      const ageMinutes = Math.floor((now.getTime() - cursor.getTime()) / 60_000);
      if (ageMinutes > Number(job.catchUpMinutes || 0)) continue;
      occurrences.push({
        id: occurrenceId(job.id, cursor),
        job,
        scheduledFor: cursor.toISOString(),
        ageMinutes,
      });
    }
  }
  return occurrences;
}

function readState(stateFile) {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return { lastCheckedAt: null, occurrences: {} };
  }
}

function writeState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const tempFile = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, stateFile);
}

function npmExecutable(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class PcWorkerScheduler {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.cwd = options.cwd || path.resolve(__dirname, '..', '..');
    this.mode = parseSchedulerMode(options.mode || this.env.PC_WORKER_SCHEDULER_MODE, 'shadow');
    this.workerId = String(options.workerId || this.env.PC_WORKER_ID || `${os.hostname()}:${process.pid}`);
    this.stateFile = options.stateFile || this.env.PC_WORKER_STATE_FILE || path.join(this.cwd, 'data', 'pc-worker-state.json');
    this.jobs = options.jobs || PC_WORKER_JOBS;
    this.tickMs = Math.max(1_000, Number(options.tickMs || this.env.PC_WORKER_TICK_MS || DEFAULT_TICK_MS));
    this.heartbeatMs = Math.max(10_000, Number(options.heartbeatMs || this.env.PC_WORKER_HEARTBEAT_MS || DEFAULT_HEARTBEAT_MS));
    this.maxConcurrent = Math.max(1, Number(options.maxConcurrent || this.env.PC_WORKER_MAX_CONCURRENT || DEFAULT_MAX_CONCURRENT));
    this.maxCatchUpMinutes = Math.max(1, Number(options.maxCatchUpMinutes || this.env.PC_WORKER_MAX_CATCH_UP_MINUTES || DEFAULT_MAX_CATCH_UP_MINUTES));
    this.spawnJob = options.spawnJob || (occurrence => this.spawnOccurrence(occurrence));
    this.persistence = options.persistence || {
      loadWorkerJobRun,
      persistWorkerHeartbeat,
      persistWorkerJobRun,
      releaseJobLock,
      tryAcquireJobLock,
    };
    this.reportFailure = options.reportFailure || (message => sendReport(message, 'ops'));
    this.state = readState(this.stateFile);
    this.startedAt = new Date().toISOString();
    this.gatewayConnected = false;
    this.queue = [];
    this.running = new Map();
    this.tickTimer = null;
    this.heartbeatTimer = null;
    this.ticking = false;
    this.persistenceWarningShown = false;
    this.stopped = false;
  }

  setGatewayConnected(connected) {
    this.gatewayConnected = connected === true;
  }

  remember(occurrence, status) {
    this.state.occurrences[occurrence.id] = {
      jobName: occurrence.job.id,
      scheduledFor: occurrence.scheduledFor,
      status,
      updatedAt: new Date().toISOString(),
    };
    const entries = Object.entries(this.state.occurrences)
      .sort((a, b) => String(b[1].scheduledFor).localeCompare(String(a[1].scheduledFor)))
      .slice(0, 2_000);
    this.state.occurrences = Object.fromEntries(entries);
    writeState(this.stateFile, this.state);
  }

  localTerminal(occurrence) {
    return TERMINAL_STATUSES.has(this.state.occurrences[occurrence.id]?.status);
  }

  async remoteTerminal(occurrence) {
    try {
      const result = await this.persistence.loadWorkerJobRun(occurrence.id);
      if (result.error) throw result.error;
      return TERMINAL_STATUSES.has(result.rows?.[0]?.status);
    } catch (err) {
      this.warnPersistence(err);
      return false;
    }
  }

  warnPersistence(err) {
    if (this.persistenceWarningShown) return;
    this.persistenceWarningShown = true;
    console.warn(`[PCWorker] DB worker 상태 저장 사용 불가, 로컬 상태로 계속합니다: ${err.message}`);
  }

  async persistRun(occurrence, update) {
    try {
      const result = await this.persistence.persistWorkerJobRun({
        id: occurrence.id,
        workerId: this.workerId,
        jobName: occurrence.job.id,
        scheduledFor: occurrence.scheduledFor,
        mode: this.mode,
        ...update,
        payload: {
          script: occurrence.job.script,
          args: occurrence.job.args || [],
          ageMinutes: occurrence.ageMinutes,
          ...(update.payload || {}),
        },
      });
      if (result?.error) throw result.error;
    } catch (err) {
      this.warnPersistence(err);
    }
  }

  async tick(now = new Date()) {
    if (this.stopped || this.ticking || this.mode === 'off') return [];
    this.ticking = true;
    try {
      const firstTick = !this.state.lastCheckedAt;
      const after = firstTick
        ? new Date(floorMinute(now).getTime() - 60_000)
        : new Date(this.state.lastCheckedAt);
      const occurrences = enumerateDueOccurrences({
        jobs: this.jobs.filter(job => !job.enabledEnv || String(this.env[job.enabledEnv]).toLowerCase() === 'true'),
        after,
        now,
        maxCatchUpMinutes: this.maxCatchUpMinutes,
      });
      this.state.lastCheckedAt = floorMinute(now).toISOString();
      writeState(this.stateFile, this.state);

      const accepted = [];
      for (const occurrence of occurrences) {
        if (this.localTerminal(occurrence) || await this.remoteTerminal(occurrence)) continue;
        accepted.push(occurrence);
        if (this.mode === 'shadow') {
          this.remember(occurrence, 'shadow_due');
          await this.persistRun(occurrence, {
            status: 'shadow_due',
            finishedAt: new Date().toISOString(),
          });
          console.log(`[PCWorker][shadow] 예정 작업 확인: ${occurrence.job.id} @ ${occurrence.scheduledFor}`);
        } else {
          this.remember(occurrence, 'queued');
          await this.persistRun(occurrence, { status: 'queued' });
          this.queue.push(occurrence);
        }
      }
      this.pump();
      return accepted;
    } finally {
      this.ticking = false;
    }
  }

  pump() {
    while (!this.stopped && this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const occurrence = this.queue.shift();
      const promise = this.execute(occurrence)
        .catch(err => console.error(`[PCWorker] ${occurrence.job.id} 실행 처리 실패: ${err.message}`))
        .finally(() => {
          this.running.delete(occurrence.id);
          this.pump();
        });
      this.running.set(occurrence.id, promise);
    }
  }

  async execute(occurrence) {
    const lockName = `pc-worker:${occurrence.job.id}`;
    let lock;
    try {
      lock = await this.persistence.tryAcquireJobLock(lockName, {
        ttlSeconds: Number(occurrence.job.timeoutMinutes || 10) * 60 + 120,
        lockedBy: this.workerId,
      });
    } catch (err) {
      this.warnPersistence(err);
      lock = { acquired: true, disabled: true };
    }
    if (!lock.acquired) {
      this.remember(occurrence, 'skipped_locked');
      await this.persistRun(occurrence, {
        status: 'skipped_locked',
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    const maxAttempts = Math.max(1, Number(occurrence.job.maxAttempts || 2));
    let result = { exitCode: 1, errorMessage: 'not started' };
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const startedAt = new Date().toISOString();
        this.remember(occurrence, 'running');
        await this.persistRun(occurrence, { status: 'running', attempt, startedAt });
        result = await this.spawnJob(occurrence);
        if (result.exitCode === 0) {
          this.remember(occurrence, 'success');
          await this.persistRun(occurrence, {
            status: 'success',
            attempt,
            startedAt,
            finishedAt: new Date().toISOString(),
            exitCode: 0,
          });
          return;
        }
        if (attempt < maxAttempts) await wait(Math.min(30_000, 2_000 * (2 ** (attempt - 1))));
      }

      this.remember(occurrence, 'failed');
      await this.persistRun(occurrence, {
        status: 'failed',
        attempt: maxAttempts,
        finishedAt: new Date().toISOString(),
        exitCode: result.exitCode,
        errorMessage: result.errorMessage,
      });
      try {
        await this.reportFailure([
          '🚨 **PC Worker 작업 실패**',
          `작업: ${occurrence.job.id}`,
          `예정 시각: ${occurrence.scheduledFor}`,
          `종료 코드: ${result.exitCode}`,
          `원인: ${result.errorMessage || 'subprocess failed'}`,
        ].join('\n'));
      } catch (notifyError) {
        console.error(`[PCWorker] 실패 알림 전송도 실패: ${notifyError.message}`);
      }
    } finally {
      try {
        await this.persistence.releaseJobLock(lockName);
      } catch (err) {
        this.warnPersistence(err);
      }
    }
  }

  spawnOccurrence(occurrence) {
    return new Promise(resolve => {
      const args = ['run', occurrence.job.script];
      if (occurrence.job.args?.length) args.push('--', ...occurrence.job.args);
      const child = spawn(npmExecutable(), args, {
        cwd: this.cwd,
        env: {
          ...process.env,
          PC_WORKER_TRIGGER_SOURCE: 'pc_worker',
          PC_WORKER_SCHEDULED_FOR: occurrence.scheduledFor,
        },
        stdio: 'inherit',
        windowsHide: true,
      });
      const timeoutMs = Math.max(60_000, Number(occurrence.job.timeoutMinutes || 10) * 60_000);
      const timeout = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
      child.once('error', err => {
        clearTimeout(timeout);
        resolve({ exitCode: 1, errorMessage: err.message });
      });
      child.once('close', (code, signal) => {
        clearTimeout(timeout);
        resolve({
          exitCode: Number.isInteger(code) ? code : 1,
          errorMessage: signal ? `terminated by ${signal}` : (code === 0 ? '' : `exit code ${code}`),
        });
      });
    });
  }

  async heartbeat(now = new Date()) {
    try {
      const result = await this.persistence.persistWorkerHeartbeat({
        workerId: this.workerId,
        hostname: os.hostname(),
        platform: process.platform,
        mode: this.mode,
        version: this.env.COMMIT_SHA || this.env.npm_package_version || PACKAGE_VERSION,
        startedAt: this.startedAt,
        lastSeenAt: now.toISOString(),
        gatewayConnected: this.gatewayConnected,
        runningJobs: this.running.size,
        queuedJobs: this.queue.length,
        payload: {
          pid: process.pid,
          node: process.versions.node,
          lastCheckedAt: this.state.lastCheckedAt,
        },
      });
      if (result?.error) throw result.error;
    } catch (err) {
      this.warnPersistence(err);
    }
  }

  async start() {
    if (this.mode === 'off') {
      console.log('[PCWorker] scheduler mode=off');
      return;
    }
    console.log(`[PCWorker] scheduler mode=${this.mode}, worker=${this.workerId}, jobs=${this.jobs.length}`);
    await this.tick();
    await this.heartbeat();
    this.tickTimer = setInterval(() => this.tick().catch(err => {
      console.error(`[PCWorker] scheduler tick 실패: ${err.message}`);
    }), this.tickMs);
    this.heartbeatTimer = setInterval(() => this.heartbeat().catch(err => {
      console.error(`[PCWorker] heartbeat 실패: ${err.message}`);
    }), this.heartbeatMs);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.tickTimer);
    clearInterval(this.heartbeatTimer);
    await Promise.allSettled([...this.running.values()]);
    await this.heartbeat();
  }
}

module.exports = {
  KST_TIME_ZONE,
  PC_WORKER_JOBS,
  PcWorkerScheduler,
  atTime,
  enumerateDueOccurrences,
  everyFiveMinutes,
  floorMinute,
  getKstParts,
  intradayQuarterHour,
  npmExecutable,
  occurrenceId,
  parseSchedulerMode,
  readState,
  writeState,
};
