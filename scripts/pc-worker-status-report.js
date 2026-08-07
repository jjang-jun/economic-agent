const { selectRows } = require('../src/utils/persistence');
const { sendReport } = require('../src/notify/reports');

function ageMinutes(value, now = new Date()) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
}

function formatStatus(heartbeat, runs = [], now = new Date()) {
  if (!heartbeat) return '⚠️ **PC Worker 상태**\n\nDB에서 heartbeat를 확인하지 못했습니다.';
  const age = ageMinutes(heartbeat.last_seen_at, now);
  const recent = runs.filter(run => Date.parse(run.scheduled_for || '') >= now.getTime() - 24 * 60 * 60_000);
  const counts = recent.reduce((acc, run) => {
    acc[run.status] = (acc[run.status] || 0) + 1;
    return acc;
  }, {});
  const failed = recent.filter(run => run.status === 'failed');
  const health = age !== null && age <= 3 && heartbeat.gateway_connected ? '정상' : '점검 필요';
  return [
    `🖥️ **PC Worker 상태 · ${health}**`,
    '',
    `Worker: ${heartbeat.worker_id}`,
    `모드: ${heartbeat.mode} · Gateway: ${heartbeat.gateway_connected ? '연결' : '끊김'}`,
    `마지막 heartbeat: ${age === null ? '확인 불가' : `${age}분 전`}`,
    `실행 중 ${heartbeat.running_jobs || 0}건 · 대기 ${heartbeat.queued_jobs || 0}건`,
    '',
    `최근 24시간: 성공 ${counts.success || 0} · 실패 ${counts.failed || 0} · shadow 예정 ${counts.shadow_due || 0}`,
    ...(failed.length ? ['', `최근 실패: ${failed.slice(0, 3).map(run => run.job_name).join(', ')}`] : []),
  ].join('\n');
}

function isPreview(args = process.argv.slice(2)) {
  return args.includes('--dry-run') || args.includes('--no-report');
}

async function main() {
  const heartbeatResult = await selectRows('worker_heartbeats', {
    select: '*', order: 'last_seen_at.desc', limit: '1',
  });
  if (!heartbeatResult.rows) throw heartbeatResult.error || new Error('worker heartbeat store unavailable');
  const runsResult = await selectRows('worker_job_runs', {
    select: 'job_name,status,scheduled_for,finished_at,error_message',
    order: 'scheduled_for.desc', limit: '500',
  });
  if (!runsResult.rows) throw runsResult.error || new Error('worker job run store unavailable');
  const message = formatStatus(heartbeatResult.rows[0], runsResult.rows);
  if (isPreview()) {
    console.log(message);
    return;
  }
  await sendReport(message, 'ops');
  console.log('[PCWorker] 상태 리포트 전송 완료');
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[PCWorker] 상태 리포트 실패: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { ageMinutes, formatStatus, isPreview };
