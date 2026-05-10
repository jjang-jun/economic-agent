#!/usr/bin/env node

const {
  buildCollectorOpsSummary,
  buildCollectorOpsAnomalies,
} = require('../src/utils/collector-ops');
const { sendTelegramMessage } = require('../src/notify/telegram');

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    days: Number(env.COLLECTOR_OPS_DAYS || 1),
    noTelegram: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--noTelegram' || arg === '--no-telegram') {
      options.noTelegram = true;
      continue;
    }
    if (arg === '--days') {
      options.days = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith('--days=')) {
      options.days = Number(arg.slice('--days='.length));
      continue;
    }
    if (/^\d+$/.test(arg)) {
      options.days = Number(arg);
    }
  }

  if (!Number.isFinite(options.days) || options.days <= 0) {
    throw new Error(`유효하지 않은 COLLECTOR_OPS_DAYS 값: ${options.days}`);
  }
  return options;
}

function formatSummary(summary, anomalies) {
  const alert = anomalies.length > 0 ? '⚠️' : '✅';
  const resolved = summary.resolvedFailureRuns ? ` · 정리된 과거 실패 ${summary.resolvedFailureRuns}` : '';
  const historicalAlerts = summary.alertEvents?.historicalFailedImmediate
    ? ` · 과거 실패 ${summary.alertEvents.historicalFailedImmediate}`
    : '';
  return [
    `${alert} <b>수집기 운영 점검</b>`,
    `상태: ${summary.healthLabel || 'n/a'}`,
    `실행: 성공 ${summary.successfulRuns ?? 0}/${summary.completedRuns ?? summary.totalRuns ?? 0} · 조치 필요 실패 ${summary.actionableFailedRuns ?? summary.failedRuns ?? 0}${resolved}`,
    `성공률: ${summary.successRatePct ?? 'n/a'}% · 최대 lookback ${summary.maxLookbackMinutes ?? 'n/a'}분`,
    `기사: 신규 ${summary.totalNewArticles ?? 0}건 · 즉시 ${summary.totalImmediateAlerts ?? 0}건 · digest ${summary.totalDigestBuffered ?? 0}건`,
    `즉시알림 실패: 최근 ${summary.alertEvents?.actionableFailedImmediate ?? summary.alertEvents?.failedImmediate ?? 0}${historicalAlerts}`,
    `알림대기: digest ${summary.alertEvents?.pendingDigest ?? 0} · catch-up ${summary.alertEvents?.pendingCatchUp ?? 0}`,
    anomalies.length > 0
      ? [`<b>이상치</b>`, ...anomalies.map(item => `▸ ${item}`)].join('\n')
      : '이상치 없음',
  ].join('\n');
}

async function main() {
  const { days, noTelegram } = parseArgs();
  const summary = await buildCollectorOpsSummary({ days });
  const anomalies = buildCollectorOpsAnomalies(summary);
  console.log(JSON.stringify({ days, summary, anomalies }, null, 2));

  if (noTelegram) {
    console.log('[collector-ops] --noTelegram 지정. Telegram 전송 생략.');
    return;
  }

  if (anomalies.length === 0 && process.env.COLLECTOR_OPS_SEND_OK !== '1') {
    console.log('[collector-ops] 이상치 없음. Telegram 전송 생략.');
    return;
  }

  await sendTelegramMessage(formatSummary(summary, anomalies), { channel: 'private' });
}

if (require.main === module) {
  main().catch(err => {
    console.error('[collector-ops] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  formatSummary,
};
