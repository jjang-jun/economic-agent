#!/usr/bin/env node

const {
  buildPriceSourceQualitySummary,
  buildPriceSourceQualityAnomalies,
} = require('../src/utils/price-source-quality');
const { sendTelegramMessage } = require('../src/notify/telegram');

function formatSummary(summary, anomalies) {
  const alert = anomalies.length > 0 ? '⚠️' : '✅';
  const attempts = summary.attempts || {};
  const providers = (attempts.byProvider || [])
    .slice(0, 4)
    .map(item => `▸ ${item.provider}: ${item.count}회 · 실패 ${item.failed}회 (${item.failureRatePct ?? 'n/a'}%)`)
    .join('\n');

  return [
    `${alert} <b>가격 Provider 점검</b>`,
    `상태: ${summary.healthLabel || 'n/a'}`,
    `스냅샷: ${summary.totalSnapshots ?? 0}건 · 종목 ${summary.tickerCount ?? 0}개`,
    `호출: ${attempts.total ?? 0}회 · 성공 ${attempts.success ?? 0} · 실패 ${attempts.failed ?? 0} · 빈 응답 ${attempts.empty ?? 0}`,
    `실패율: ${attempts.failureRatePct ?? 'n/a'}% · 빈 응답률: ${attempts.emptyRatePct ?? 'n/a'}%`,
    `공식 EOD 비중: ${summary.officialEod?.ratePct ?? 'n/a'}% · fallback 비중: ${summary.fallback?.ratePct ?? 'n/a'}%`,
    summary.providerDecision?.label ? `판단: ${summary.providerDecision.label}` : '',
    providers ? `<b>Provider별</b>\n${providers}` : '',
    anomalies.length > 0
      ? [`<b>이상치</b>`, ...anomalies.map(item => `▸ ${item}`)].join('\n')
      : '이상치 없음',
  ].filter(Boolean).join('\n');
}

async function main() {
  const days = Number(process.argv[2] || process.env.PRICE_PROVIDER_OPS_DAYS || 1);
  const summary = await buildPriceSourceQualitySummary({ days });
  const anomalies = buildPriceSourceQualityAnomalies(summary);
  console.log(JSON.stringify({ days, summary, anomalies }, null, 2));

  if (anomalies.length === 0 && process.env.PRICE_PROVIDER_SEND_OK !== '1') {
    console.log('[price-provider-ops] 이상치 없음. Telegram 전송 생략.');
    return;
  }

  await sendTelegramMessage(formatSummary(summary, anomalies), { channel: 'private' });
  console.log('[price-provider-ops] Telegram 전송 완료');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[price-provider-ops] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = {
  formatSummary,
};
