#!/usr/bin/env node

const {
  buildPriceSourceQualitySummary,
  buildPriceSourceQualityAnomalies,
} = require('../src/utils/price-source-quality');
const { sendTelegramMessage } = require('../src/notify/telegram');

function getKSTClock(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return {
    hour,
    minute,
    minutes: hour * 60 + minute,
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} KST`,
  };
}

function shouldSendScheduledOpsReport(now = new Date(), env = process.env) {
  if (env.GITHUB_EVENT_NAME !== 'schedule') return true;
  if (env.PRICE_PROVIDER_ALLOW_OFF_HOURS === '1') return true;
  const clock = getKSTClock(now);
  const inNightWindow = clock.minutes >= (23 * 60 + 40) || clock.minutes <= 20;
  return inNightWindow;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    days: Number(env.PRICE_PROVIDER_OPS_DAYS || 1),
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
    throw new Error(`유효하지 않은 PRICE_PROVIDER_OPS_DAYS 값: ${options.days}`);
  }
  return options;
}

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
    `공식 EOD 비중: ${summary.officialEod?.ratePct ?? 'n/a'}% · 국내 fallback: ${summary.fallback?.domesticRatePct ?? 'n/a'}% · 해외 Yahoo: ${summary.fallback?.globalRatePct ?? 'n/a'}%`,
    summary.providerDecision?.label ? `판단: ${summary.providerDecision.label}` : '',
    providers ? `<b>Provider별</b>\n${providers}` : '',
    anomalies.length > 0
      ? [`<b>이상치</b>`, ...anomalies.map(item => `▸ ${item}`)].join('\n')
      : '이상치 없음',
  ].filter(Boolean).join('\n');
}

async function main() {
  const { days, noTelegram } = parseArgs();
  if (!shouldSendScheduledOpsReport()) {
    console.log(`[price-provider-ops] 지연 실행 감지. 예정 시간대 밖(${getKSTClock().label})이라 Telegram 전송을 건너뜁니다.`);
    return;
  }
  const summary = await buildPriceSourceQualitySummary({ days });
  const anomalies = buildPriceSourceQualityAnomalies(summary);
  console.log(JSON.stringify({ days, summary, anomalies }, null, 2));

  if (noTelegram) {
    console.log('[price-provider-ops] --noTelegram 지정. Telegram 전송 생략.');
    return;
  }

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
  getKSTClock,
  parseArgs,
  formatSummary,
  shouldSendScheduledOpsReport,
};
