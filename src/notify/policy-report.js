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

function normalizeSummaryText(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\.{2,}/g, '…')
    .replace(/\s*([■□●○※◆▶])\s*/g, '\n$1 ')
    .replace(/\s+([1-9]\d?\.)\s+(?=[가-힣A-Za-z])/g, '\n$1 ')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function extractSummaryPoints(event = {}, options = {}) {
  const maxPoints = Math.max(1, Math.min(4, Number(options.maxPoints || 3)));
  const maxPointChars = Math.max(80, Math.min(320, Number(options.maxPointChars || 230)));
  const raw = normalizeSummaryText(event.summary || '');
  if (!raw) return [];

  const titleKey = String(event.title || '').replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 50);
  let candidates = raw
    .split(/\n+|(?<=[.!?。])\s+/u)
    .map(item => item.replace(/^[■□●○※◆▶]\s*/, '').trim())
    .filter(item => item.length >= 8)
    .filter(item => !/^(?:\d+\.?\s*)?(?:보도\s*내용|보도에\s*대한\s*설명|정부\s*입장)$/u.test(item))
    .filter(item => {
      const key = item.replace(/[^0-9A-Za-z가-힣]/g, '');
      return !titleKey || !key.startsWith(titleKey);
    });
  if (event.stage === 'official_clarification') {
    const clarificationSignal = /확정된 바 없|사실과 다르|검토 중|정부.{0,12}(?:입장|설명)|알려드립니다|보도.{0,12}설명/u;
    candidates = candidates
      .map((item, index) => ({ item, index, priority: clarificationSignal.test(item) ? 1 : 0 }))
      .sort((a, b) => b.priority - a.priority || a.index - b.index)
      .map(entry => entry.item);
  }

  const selected = [];
  const seen = new Set();
  for (const candidate of candidates.length > 0 ? candidates : [raw]) {
    const point = clip(candidate, maxPointChars);
    const identity = point.toLowerCase().replace(/[^0-9a-z가-힣]/g, '').slice(0, 80);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    selected.push(point);
    if (selected.length >= maxPoints) break;
  }
  return selected;
}

function policyImpact(event = {}) {
  const domains = new Set([event.domain, ...(event.domains || [])].filter(Boolean));
  const impacts = [];
  if (domains.has('tax')) impacts.push('세후 수익·납부세액·ISA/절세계좌 운용 조건');
  if (domains.has('real_estate')) impacts.push('주택 매수 예산·보유/양도 비용·전세 판단');
  if (domains.has('loan_finance')) impacts.push('주담대 가능액·DSR/LTV·상환 부담');
  if (domains.has('pension')) impacts.push('연금 납입·세액공제·수령 전략');
  if (domains.has('capital_market')) impacts.push('주식·ETF·펀드의 세금과 거래 규칙');
  if (impacts.length === 0) return '직접 영향은 원문의 적용 대상과 조건을 확인해야 합니다.';
  return `${impacts.join(', ')}에 영향을 줄 수 있습니다. 적용 대상이 확인되기 전에는 현재 계획을 자동 변경하지 않습니다.`;
}

function verificationForStage(stage = '') {
  const checks = {
    official_clarification: '기존 보도와 정부 설명의 차이, 확정되지 않았다고 밝힌 범위, 후속 공식 발표',
    government_proposal: '정부안 원문, 적용 대상·한도, 국회/입법 절차, 공포 여부와 시행일',
    legislative_notice: '입법예고 원문, 적용 대상·예외·경과규정, 의견제출 기한',
    submitted: '국회 의안 원문, 심사 과정의 수정안, 통과·공포 여부와 시행일',
    passed: '최종 의결문, 공포일·시행일, 예외 및 경과규정',
    promulgated: '공포 법령과 시행령, 시행일, 적용 대상·신청 절차·경과규정',
    effective: '현재 시행 중인 법령·고시, 본인 적용 여부, 신청 마감과 증빙',
    official_announcement: '세부 시행 문서, 적용 대상·조건, 후속 입법 또는 공고 여부',
  };
  return checks[stage] || checks.official_announcement;
}

function formatPublishedAt(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).map(item => [item.type, item.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatLegislativeStatus(event = {}) {
  const bill = event.legislative;
  if (!bill) return '';
  const parts = [
    bill.age ? `제${bill.age}대` : '',
    bill.billNo ? `의안 ${bill.billNo}` : '',
    bill.committee || '',
    bill.plenaryResult ? `본회의 ${bill.plenaryResult}` : '',
    bill.promulgationDate ? `공포 ${bill.promulgationDate}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function formatPolicyItem(event, index) {
  const domains = [event.domain, ...(event.domains || [])].filter(Boolean);
  const label = [...new Set(domains)]
    .map(domain => DOMAIN_LABELS[domain] || domain)
    .join(' · ') || '정책';
  const mentionedDates = (event.mentionedDates || []).length > 0
    ? event.mentionedDates.map(escapeHtml).join(', ')
    : '원문에서 별도 날짜를 추출하지 못함';
  const publishedAt = formatPublishedAt(event.publishedAt);
  const legislativeStatus = formatLegislativeStatus(event);
  const summaryPoints = extractSummaryPoints(event);
  const summary = summaryPoints.length > 0
    ? summaryPoints.map(point => `  • ${escapeHtml(point)}`).join('\n')
    : '  • 공식 RSS에 상세 요약이 없어 제목과 원문을 직접 확인해야 합니다.';
  const source = event.link
    ? `<a href="${escapeHtml(event.link)}">${escapeHtml(event.authority || '공식 원문')}</a>`
    : escapeHtml(event.authority || '공식 원문');
  return [
    `<b>${index + 1}. [${escapeHtml(label)}] ${escapeHtml(clip(event.title, 130))}</b>`,
    `▸ 확정도: <b>${escapeHtml(event.stageLabel || event.stage || '공식 발표')}</b>`,
    `▸ 발표기관/시각: ${escapeHtml(event.authority || '공식기관')}${publishedAt ? ` · ${escapeHtml(publishedAt)} KST` : ''}`,
    ...(legislativeStatus ? [`▸ 의안 추적: ${escapeHtml(legislativeStatus)}`] : []),
    `▸ 상세 요약:\n${summary}`,
    `▸ 나에게 미치는 영향(조건부): ${escapeHtml(policyImpact(event))}`,
    `▸ 지금 할 일: ${escapeHtml(event.action || '세부 조건과 후속 문서 확인')}`,
    `▸ 반드시 확인: ${escapeHtml(verificationForStage(event.stage))}`,
    `▸ 원문상 주요 날짜: ${mentionedDates}`,
    `▸ 공식 근거: ${source}`,
  ].join('\n');
}

function formatPolicyRadarReport(report = {}) {
  const events = (report.events || []).slice(0, 10);
  const failed = (report.sourceResults || []).filter(source => !source.ok);
  const status = failed.length > 0
    ? `공식 소스 ${report.successfulSourceCount || 0}/${report.sourceResults?.length || 0} 조회 완료 · 수집 공백 ${failed.length}개`
    : `공식 소스 ${report.successfulSourceCount || 0}/${report.sourceResults?.length || 0} 조회 완료`;
  const part = report.partLabel ? ` · ${report.partLabel}` : '';
  const failureLine = failed.length > 0
    ? `\n⚠️ 이번 실행 수집 공백: ${failed.map(source => {
        const kind = source.sourceKind === 'official_clarification' ? '설명·정정' : '보도자료';
        return escapeHtml(`${source.authority || source.id} ${kind}`);
      }).join(', ')}\n해당 기관의 최신 문서만 확인하지 못했습니다. 정책 상태가 ‘미확정’이라는 뜻은 아니며 다음 실행에서 자동 재시도합니다.`
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
  normalizeSummaryText,
  extractSummaryPoints,
  policyImpact,
  verificationForStage,
  formatPublishedAt,
  formatLegislativeStatus,
  formatPolicyItem,
  formatPolicyRadarReport,
  splitPolicyRadarReports,
  sendPolicyRadarReport,
};
