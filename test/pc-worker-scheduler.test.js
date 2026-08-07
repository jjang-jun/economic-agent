const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PC_WORKER_JOBS,
  PcWorkerScheduler,
  enumerateDueOccurrences,
  getKstParts,
  npmExecutable,
  parseSchedulerMode,
} = require('../src/worker/pc-scheduler');

function temporaryStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'economic-agent-worker-'));
  return path.join(dir, 'state.json');
}

function memoryPersistence() {
  const runs = new Map();
  const heartbeats = [];
  return {
    runs,
    heartbeats,
    async loadWorkerJobRun(id) { return { rows: runs.has(id) ? [runs.get(id)] : [] }; },
    async persistWorkerJobRun(run) { runs.set(run.id, { status: run.status, ...run }); },
    async persistWorkerHeartbeat(value) { heartbeats.push(value); },
    async tryAcquireJobLock() { return { acquired: true }; },
    async releaseJobLock() {},
  };
}

test('PC worker schedules use Asia/Seoul time independently from host OS timezone', () => {
  const parts = getKstParts(new Date('2026-08-05T23:20:00.000Z'));
  assert.deepEqual(parts, {
    year: 2026,
    month: 8,
    day: 6,
    hour: 8,
    minute: 20,
    weekday: 4,
  });
  const due = enumerateDueOccurrences({
    jobs: PC_WORKER_JOBS,
    after: new Date('2026-08-05T23:19:00.000Z'),
    now: new Date('2026-08-05T23:20:30.000Z'),
  });
  assert.ok(due.some(item => item.job.id === 'digest-preopen'));
  assert.ok(due.some(item => item.job.id === 'news-collector'));
});

test('shadow scheduler records due jobs but never spawns a subprocess', async () => {
  const persistence = memoryPersistence();
  let spawned = 0;
  const job = {
    id: 'test-job',
    script: 'test',
    when: parts => parts.hour === 12 && parts.minute === 0,
    catchUpMinutes: 10,
  };
  const scheduler = new PcWorkerScheduler({
    mode: 'shadow',
    jobs: [job],
    stateFile: temporaryStateFile(),
    persistence,
    spawnJob: async () => {
      spawned += 1;
      return { exitCode: 0 };
    },
  });
  scheduler.state.lastCheckedAt = '2026-08-05T02:59:00.000Z';
  const accepted = await scheduler.tick(new Date('2026-08-05T03:00:20.000Z'));

  assert.equal(accepted.length, 1);
  assert.equal(spawned, 0);
  assert.equal([...persistence.runs.values()][0].status, 'shadow_due');
});

test('active scheduler executes a due job once and records success', async () => {
  const persistence = memoryPersistence();
  let spawned = 0;
  const scheduler = new PcWorkerScheduler({
    mode: 'active',
    jobs: [{
      id: 'test-job',
      script: 'test',
      when: parts => parts.hour === 12 && parts.minute === 0,
      catchUpMinutes: 10,
      maxAttempts: 1,
    }],
    stateFile: temporaryStateFile(),
    persistence,
    spawnJob: async () => {
      spawned += 1;
      return { exitCode: 0 };
    },
  });
  scheduler.state.lastCheckedAt = '2026-08-05T02:59:00.000Z';
  await scheduler.tick(new Date('2026-08-05T03:00:10.000Z'));
  await new Promise(resolve => setTimeout(resolve, 10));
  await scheduler.tick(new Date('2026-08-05T03:00:40.000Z'));

  assert.equal(spawned, 1);
  assert.equal([...persistence.runs.values()][0].status, 'success');
});

test('scheduler modes fail closed and npm executable is OS portable', () => {
  assert.equal(parseSchedulerMode(undefined), 'shadow');
  assert.equal(parseSchedulerMode('active'), 'active');
  assert.throws(() => parseSchedulerMode('unsafe'), /Invalid/);
  assert.equal(npmExecutable('win32'), 'npm.cmd');
  assert.equal(npmExecutable('darwin'), 'npm');
  assert.equal(npmExecutable('linux'), 'npm');
});

test('environment-gated maintenance jobs remain disabled by default', async () => {
  const persistence = memoryPersistence();
  const scheduler = new PcWorkerScheduler({
    env: {},
    mode: 'shadow',
    jobs: [{
      id: 'database-backup',
      script: 'home:db:backup',
      when: parts => parts.hour === 12 && parts.minute === 0,
      catchUpMinutes: 10,
      enabledEnv: 'HOME_DB_SCHEDULED_BACKUP_ENABLED',
    }],
    stateFile: temporaryStateFile(),
    persistence,
  });
  scheduler.state.lastCheckedAt = '2026-08-05T02:59:00.000Z';
  const accepted = await scheduler.tick(new Date('2026-08-05T03:00:20.000Z'));
  assert.deepEqual(accepted, []);
  assert.equal(persistence.runs.size, 0);
});
