#!/usr/bin/env node

const {
  buildCollectorOpsSummary,
  buildCollectorOpsAnomalies,
} = require('../src/utils/collector-ops');
const { sendTelegramMessage } = require('../src/notify/telegram');

function formatSummary(summary, anomalies) {
  const alert = anomalies.length > 0 ? '⚠️' : '✅';
  return [
    `${alert} <b>수집기 운영 점검</b>`,
    `상태: ${summary.healthLabel || 'n/a'}`,
    `실행: 성공 ${summary.successfulRuns ?? 0}/${summary.completedRuns ?? summary.totalRuns ?? 0} · 실패 ${summary.failedRuns ?? 0}`,
    `성공률: ${summary.successRatePct ?? 'n/a'}% · 최대 lookback ${summary.maxLookbackMinutes ?? 'n/a'}분`,
    `기사: 신규 ${summary.totalNewArticles ?? 0}건 · 즉시 ${summary.totalImmediateAlerts ?? 0}건 · digest ${summary.totalDigestBuffered ?? 0}건`,
    `알림대기: digest ${summary.alertEvents?.pendingDigest ?? 0} · catch-up ${summary.alertEvents?.pendingCatchUp ?? 0}`,
    anomalies.length > 0
      ? [`<b>이상치</b>`, ...anomalies.map(item => `▸ ${item}`)].join('\n')
      : '이상치 없음',
  ].join('\n');
}

async function main() {
  const days = Number(process.argv[2] || process.env.COLLECTOR_OPS_DAYS || 1);
  const summary = await buildCollectorOpsSummary({ days });
  const anomalies = buildCollectorOpsAnomalies(summary);
  console.log(JSON.stringify({ days, summary, anomalies }, null, 2));

  if (anomalies.length === 0 && process.env.COLLECTOR_OPS_SEND_OK !== '1') {
    console.log('[collector-ops] 이상치 없음. Telegram 전송 생략.');
    return;
  }

  await sendTelegramMessage(formatSummary(summary, anomalies), { channel: 'private' });
}

main().catch(err => {
  console.error('[collector-ops] 실패:', err.message);
  process.exit(1);
});
