const { selectRows } = require('../src/utils/persistence');
const { auditShadowObservation, formatShadowAudit } = require('../src/worker/shadow-audit');

async function main() {
  const startedAt = process.env.PC_WORKER_SHADOW_STARTED_AT;
  if (!startedAt) throw new Error('PC_WORKER_SHADOW_STARTED_AT is required');
  const heartbeatResult = await selectRows('worker_heartbeats', {
    select: '*', order: 'last_seen_at.desc', limit: '1',
  });
  if (!heartbeatResult.rows) throw heartbeatResult.error || new Error('worker heartbeat store unavailable');
  const runResult = await selectRows('worker_job_runs', {
    select: '*',
    scheduled_for: `gt.${new Date(startedAt).toISOString()}`,
    order: 'scheduled_for.asc',
    limit: '2000',
  });
  if (!runResult.rows) throw runResult.error || new Error('worker run store unavailable');
  const audit = auditShadowObservation({
    startedAt,
    heartbeat: heartbeatResult.rows[0],
    runs: runResult.rows,
    env: process.env,
  });
  console.log(formatShadowAudit(audit));
  if (process.argv.includes('--require-ready') && !audit.ready) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[PCWorker] shadow audit 실패: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
