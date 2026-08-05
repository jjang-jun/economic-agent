const { sendDiscordReport } = require('./discord-reports');

const DOMAIN_LABELS = {
  tax: '세금·절세계좌',
  real_estate: '부동산',
  loan_finance: '대출·금융',
  pension: '연금',
  capital_market: '자본시장',
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clip(value = '', max = 180) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatPolicyItem(event, index) {
  const domains = [event.domain, ...(event.domains || [])].filter(Boolean);
  const label = [...new Set(domains)]
    .map(domain => DOMAIN_LABELS[domain] || domain)
    .join(' · ') || '정책';
  const dates = (event.mentionedDates || []).length > 0
    ? `\n▸ 언급 날짜: ${event.mentionedDates.map(escapeHtml).join(', ')}`
    : '';
  const summary = event.summary ? `\n▸ 핵심: ${escapeHtml(clip(event.summary))}` : '';
  const source = event.link
    ? `<a href="${escapeHtml(event.link)}">${escapeHtml(event.authority || '공식 원문')}</a>`
    : escapeHtml(event.authority || '공식 원문');
  return [
    `<b>${index + 1}. [${escapeHtml(label)}] ${escapeHtml(clip(event.title, 130))}</b>`,
    `▸ 상태: ${escapeHtml(event.stageLabel || event.stage || '공식 발표')}`,
    `▸ 행동: ${escapeHtml(event.action || '세부 조건 확인')}${dates}${summary}`,
    `▸ 근거: ${source}`,
  ].join('\n');
}

function formatPolicyRadarReport(report = {}) {
  const events = (report.events || []).slice(0, 10);
  const failed = (report.sourceResults || []).filter(source => !source.ok);
  const status = failed.length > 0
    ? `공식 소스 ${report.successfulSourceCount || 0}개 확인 · ${failed.length}개 일시 실패`
    : `공식 소스 ${report.successfulSourceCount || 0}개 확인`;
  const part = report.partLabel ? ` · ${report.partLabel}` : '';
  const failureLine = failed.length > 0
    ? `\n⚠️ 미확인: ${failed.map(source => escapeHtml(source.id)).join(', ')} — 다음 실행에서 재시도`
    : '';

  return [
    '🏛️ <b>정책·자산 레이더</b>',
    `${escapeHtml(status)} · 신규/변경 ${events.length}건${escapeHtml(part)}${failureLine}`,
    ...events.map(formatPolicyItem),
    '<i>정부안은 확정 법률이 아닙니다. 가입·해지·매매 전 공포 법령과 시행일을 다시 확인합니다.</i>',
  ].join('\n\n');
}

function splitPolicyRadarReports(report = {}, maxChars = 3900) {
  const events = report.events || [];
  if (events.length === 0) return [report];
  const chunks = [];
  let current = [];
  for (const event of events) {
    const candidate = [...current, event];
    if (current.length > 0 && formatPolicyRadarReport({ ...report, events: candidate }).length > maxChars) {
      chunks.push(current);
      current = [event];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.map((chunk, index) => ({
    ...report,
    events: chunk,
    partLabel: chunks.length > 1 ? `${index + 1}/${chunks.length}` : '',
  }));
}

async function sendPolicyRadarReport(report, options = {}) {
  const reports = splitPolicyRadarReports(report, options.maxChars);
  let delivered = false;
  const targets = [
    {
      channel: 'policy_tax',
      events: (report.events || []).filter(event => {
        const domains = new Set([event.domain, ...(event.domains || [])].filter(Boolean));
        return !domains.has('real_estate') || domains.size > 1;
      }),
    },
    {
      channel: 'policy_real_estate',
      events: (report.events || []).filter(event => (
        [event.domain, ...(event.domains || [])].includes('real_estate')
      )),
    },
  ];
  for (const target of targets) {
    if (target.events.length === 0) continue;
    const discordReports = splitPolicyRadarReports({ ...report, events: target.events }, options.maxChars);
    for (const part of discordReports) {
      const result = await (options.sender || sendDiscordReport)(formatPolicyRadarReport(part), target.channel);
      if (result?.delivered || (options.sender && result !== false)) delivered = true;
    }
  }
  if (!delivered && reports.length > 0) {
    throw new Error('Policy notification delivery failed: no channel delivered');
  }
  return true;
}

module.exports = {
  DOMAIN_LABELS,
  formatPolicyItem,
  formatPolicyRadarReport,
  splitPolicyRadarReports,
  sendPolicyRadarReport,
};
