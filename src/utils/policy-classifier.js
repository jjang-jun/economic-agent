const crypto = require('crypto');

const DOMAIN_RULES = {
  tax: [
    '세제', '세법', '조세', '소득세', '법인세', '양도소득세', '상속세', '증여세',
    '종합부동산세', '종부세', '재산세', '취득세', '비과세', '분리과세', '소득공제',
    '세액공제', '금융소득', '배당소득', 'isa', '개인종합자산관리계좌',
  ],
  real_estate: [
    '부동산', '주택', '아파트', '청약', '분양', '재건축', '재개발', '전세', '월세',
    '임대차', '주택공급', '공시가격', '토지거래허가', '다주택', '1주택', '주거',
  ],
  loan_finance: [
    '주택담보대출', '주담대', '가계대출', '가계부채', '대출규제', '대출 한도',
    'dsr', 'dti', 'ltv', '중도상환수수료', '전세대출', '정책금융', '금융소비자',
  ],
  pension: [
    '연금저축', '퇴직연금', '개인형퇴직연금', '국민연금', '기초연금', '연금계좌',
    'irp', '연금소득', '연금 수령',
  ],
  capital_market: [
    '자본시장', '배당', '공매도', '증권거래세', '금융투자', '상장주식', '펀드',
    'etf', 'isa', '개인종합자산관리계좌', '기업성장집합투자기구', 'bdc', '국민성장펀드',
  ],
};

const STAGE_LABELS = {
  official_clarification: '정부 설명·정정',
  government_proposal: '정부안·추진안',
  legislative_notice: '입법예고',
  submitted: '국회 제출',
  passed: '국회 통과',
  promulgated: '공포',
  effective: '시행',
  official_announcement: '공식 발표',
};

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizedText(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizePolicyTitle(value = '') {
  return normalizedText(value)
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\([^)]*(보도|설명|참고|정정)[^)]*\)/g, ' ')
    .replace(/\b(보도자료|보도참고|보도설명|설명자료)\b/g, ' ')
    .replace(/[^0-9a-z가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchDomains(text) {
  const matches = [];
  for (const [domain, keywords] of Object.entries(DOMAIN_RULES)) {
    const hitKeywords = keywords.filter(keyword => text.includes(keyword.toLowerCase()));
    if (hitKeywords.length > 0) matches.push({ domain, keywords: hitKeywords });
  }
  return matches;
}

function classifyStage(document, text) {
  if (document.sourceKind === 'official_clarification' || /결정된 바 없|사실과 다르|보도에 신중|설명드립니다|바로잡/.test(text)) {
    return 'official_clarification';
  }
  if (/공포(?:하였|됐|되었|합니다)|법률 제\d+호/.test(text)) return 'promulgated';
  if (/본회의(?:에서)? (?:의결|통과)|국회 본회의 통과/.test(text)) return 'passed';
  if (/국회에? 제출(?:했|하였|할 예정|한다)|정기국회 제출/.test(text)) return 'submitted';
  if (/입법예고|행정예고/.test(text)) return 'legislative_notice';
  if (/시행(?:합니다|됐다|되었|에 들어갔)|시행일은/.test(text) && !/시행 예정|시행 추진/.test(text)) return 'effective';
  if (/개편안|개정안|정부안|추진 방안|도입 방안|신설 추진|발표했다|발표합니다/.test(text)) return 'government_proposal';
  return 'official_announcement';
}

function actionForStage(stage) {
  if (stage === 'official_clarification') return '기존 행동 보류 · 정정 내용 확인';
  if (stage === 'government_proposal') return '확정 전 · 가입·해지·매매 보류';
  if (stage === 'legislative_notice') return '적용 대상과 의견제출 기한 확인';
  if (stage === 'submitted') return '국회 심사 중 변경 여부 추적';
  if (stage === 'passed') return '공포일·시행일·경과규정 확인';
  if (stage === 'promulgated') return '시행일 전 계좌·대출·보유자산 점검';
  if (stage === 'effective') return '현재 적용 조건과 신청 마감 확인';
  return '세부 조건과 후속 문서 확인';
}

function extractDates(text) {
  const matches = [...String(text).matchAll(/(20\d{2})[.년/-]\s*(\d{1,2})[.월/-]\s*(\d{1,2})일?/g)];
  return [...new Set(matches.map(match => (
    `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
  )))].slice(0, 5);
}

function classifyPolicyDocument(document) {
  const text = normalizedText(`${document.title || ''} ${document.summary || ''}`);
  const domainMatches = matchDomains(text);
  if (domainMatches.length === 0) return null;

  const primary = domainMatches
    .sort((a, b) => b.keywords.length - a.keywords.length)[0];
  const stage = classifyStage(document, text);
  const normalizedTitle = normalizePolicyTitle(document.title);
  const identity = document.externalId || document.link || `${document.authority}:${normalizedTitle}`;
  const id = `policy:${sha256(`${document.sourceId}|${identity}`).slice(0, 24)}`;
  const eventKey = `policy-event:${sha256(`${primary.domain}|${normalizedTitle}`).slice(0, 24)}`;
  const contentHash = sha256(`${document.title}|${document.summary}|${document.link}`);

  return {
    id,
    eventKey,
    contentHash,
    title: document.title || '',
    summary: document.summary || '',
    link: document.link || '',
    publishedAt: document.pubDate || null,
    authority: document.authority || '',
    sourceId: document.sourceId || '',
    sourceKind: document.sourceKind || '',
    domain: primary.domain,
    domains: domainMatches.map(match => match.domain),
    matchedKeywords: [...new Set(domainMatches.flatMap(match => match.keywords))].slice(0, 12),
    stage,
    stageLabel: STAGE_LABELS[stage],
    action: actionForStage(stage),
    mentionedDates: extractDates(`${document.title || ''} ${document.summary || ''}`),
    official: true,
  };
}

function classifyPolicyDocuments(documents = []) {
  return documents.map(classifyPolicyDocument).filter(Boolean);
}

module.exports = {
  DOMAIN_RULES,
  STAGE_LABELS,
  normalizePolicyTitle,
  matchDomains,
  classifyStage,
  actionForStage,
  extractDates,
  classifyPolicyDocument,
  classifyPolicyDocuments,
};
