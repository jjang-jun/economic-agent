#!/usr/bin/env node

const {
  buildPriceSourceQualitySummary,
  buildPriceSourceQualityAnomalies,
} = require('../src/utils/price-source-quality');
const { sendReport } = require('../src/notify/reports');

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
    noReport: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-report') {
      options.noReport = true;
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
  const decision = summary.providerDecision || {};
  const urgentActions = new Set(['investigate', 'fix_provider', 'improve_domestic_data', 'improve_official_eod']);
  const urgent = urgentActions.has(decision.action);
  const alert = urgent ? '⚠️' : (anomalies.length > 0 ? '🟡' : '✅');
  const attempts = summary.attempts || {};
  const providerLabels = {
    'kis-rest': 'KIS 국내 현재가',
    'krx-openapi': 'KRX 공식 종가',
    'data-go-kr': '공공데이터 종가',
    'naver-finance': 'Naver 국내 대체',
    'alpaca-iex': 'Alpaca 미국 현재가',
    'alpaca-market-data': 'Alpaca 미국 현재가',
    fmp: 'FMP 미국 가격',
    'alpha-vantage': 'Alpha Vantage',
    tiingo: 'Tiingo',
    'yahoo-finance': 'Yahoo 최종 대체',
  };
  const pct = value => typeof value === 'number' ? `${value}%` : '자료 없음';
  const decisionGuidance = {
    investigate: '즉시 조치: 가격 저장과 Supabase 연결을 확인하세요.',
    fix_provider: '즉시 조치: API 키·토큰·네트워크 오류를 확인하세요.',
    improve_domestic_data: '조치 필요: 국내 우선 가격 경로가 정상인지 확인하세요.',
    improve_official_eod: '조치 필요: KRX·공공데이터 종가 수집을 확인하세요.',
    monitor: '즉시 장애는 아닙니다. 빈 응답 뒤 대체 경로가 최종 가격을 확보하는지 추세만 확인하세요.',
    monitor_global_fallback: '즉시 장애는 아닙니다. 해외 가격은 확보됐지만 Yahoo 대체 경로 의존이 높습니다.',
    ok: '현재 조치가 필요하지 않습니다.',
  };
  const providers = (attempts.byProvider || [])
    .sort((a, b) => b.failed - a.failed || b.empty - a.empty || b.count - a.count)
    .slice(0, 5)
    .map(item => `▸ ${providerLabels[item.provider] || item.provider}: ${item.count}회 중 성공 ${item.success ?? 0} · 빈 응답 ${item.empty ?? 0} · 오류 ${item.failed ?? 0}`)
    .join('\n');
  const formattedAnomalies = anomalies.map(item => String(item)
    .replace('가격 provider', '가격 제공처')
    .replace(/^fmp\b/i, 'FMP 미국 가격')
    .replace(/^alpaca-market-data\b/i, 'Alpaca 미국 현재가')
    .replace(/^kis-rest\b/i, 'KIS 국내 현재가')
    .replace('해외 Yahoo fallback 비중', '해외 가격의 Yahoo 대체 경로 비중')
    .replace('국내 Naver/Yahoo fallback 비중', '국내 가격의 대체 경로 비중'));
  const officialEodText = (summary.eodSnapshots || 0) > 0
    ? pct(summary.officialEod?.ratePct)
    : '이번 점검 구간에 종가 표본 없음 (수집 실패 의미 아님)';

  return [
    `${alert} <b>가격 데이터 경로 점검</b>`,
    `<b>한줄 판단</b>\n${decision.label || '판단 자료 없음'}`,
    decisionGuidance[decision.action] || '세부 상태를 확인하세요.',
    '',
    '<b>최종 가격 확보 상태</b>',
    `▸ 최근 가격 ${summary.totalSnapshots ?? 0}건 · ${summary.tickerCount ?? 0}종목`,
    `▸ 가격 조회 ${attempts.total ?? 0}회: 성공 ${attempts.success ?? 0} · 빈 응답 ${attempts.empty ?? 0} · 실제 오류 ${attempts.failed ?? 0}`,
    `▸ 실제 오류율 ${pct(attempts.failureRatePct)} · 빈 응답률 ${pct(attempts.emptyRatePct)}`,
    '<i>빈 응답은 해당 제공처에 값이 없어 다음 경로를 조회한 경우입니다. 최종 가격 누락이나 API 오류와는 다릅니다.</i>',
    '',
    '<b>경로 의존도</b>',
    `▸ 국내 공식 종가 ${officialEodText}`,
    `▸ 국내 대체 가격 ${pct(summary.fallback?.domesticRatePct)}`,
    `▸ 해외 Yahoo 대체 가격 ${pct(summary.fallback?.globalRatePct)}`,
    providers ? `<b>조회 경로별</b>\n${providers}` : '',
    formattedAnomalies.length > 0
      ? [`<b>관찰 항목</b>`, ...formattedAnomalies.map(item => `▸ ${item}`)].join('\n')
      : '<b>관찰 항목</b>\n▸ 없음',
  ].filter(Boolean).join('\n');
}

async function main() {
  const { days, noReport } = parseArgs();
  if (!shouldSendScheduledOpsReport()) {
    console.log(`[price-provider-ops] 지연 실행 감지. 예정 시간대 밖(${getKSTClock().label})이라 Discord 전송을 건너뜁니다.`);
    return;
  }
  const summary = await buildPriceSourceQualitySummary({ days });
  const anomalies = buildPriceSourceQualityAnomalies(summary);
  console.log(JSON.stringify({ days, summary, anomalies }, null, 2));

  if (noReport) {
    console.log('[price-provider-ops] --no-report 지정. Discord 전송 생략.');
    return;
  }

  if (anomalies.length === 0 && process.env.PRICE_PROVIDER_SEND_OK !== '1') {
    console.log('[price-provider-ops] 이상치 없음. Discord 전송 생략.');
    return;
  }

  const message = formatSummary(summary, anomalies);
  await sendReport(message, 'ops');
  console.log('[price-provider-ops] 알림 전송 완료');
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
