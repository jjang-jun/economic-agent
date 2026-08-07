const EXPERT_ROLES = Object.freeze({
  investment: Object.freeze({
    id: 'investment',
    name: '투자 전문가',
    shortName: '투자',
    mission: '주식·ETF·자산배분 후보를 기대값, 진입 조건, 손실 한도 관점에서 분석한다.',
    aliases: ['투자 전문가', '주식 전문가', '투자 담당', '투자분석가'],
    keywords: ['주식', '종목', 'ETF', '매수', '매도', '투자', '시장 전망', '분할 매수', '목표가'],
    contextScopes: ['portfolio', 'recommendations', 'risk_policy'],
    reviewerCandidates: ['risk_manager', 'data_auditor'],
  }),
  real_estate: Object.freeze({
    id: 'real_estate',
    name: '부동산 전문가',
    shortName: '부동산',
    mission: '서울·경기 아파트의 가격·거래량·전세·호가·대출여력을 교차검증해 저점에 가까운 매수 검토 구간과 추격 위험을 분석한다.',
    aliases: ['부동산 전문가', '주택 전문가', '부동산 담당'],
    keywords: ['부동산', '아파트', '주택', '내집마련', '내 집 마련', '청약', '전세', '월세', '주택담보대출', '주담대'],
    contextScopes: ['portfolio', 'real_estate_goal', 'real_estate_market', 'real_estate_indices', 'real_estate_policy'],
    reviewerCandidates: ['portfolio_manager', 'tax_pension'],
  }),
  tax_pension: Object.freeze({
    id: 'tax_pension',
    name: '세금·연금 전문가',
    shortName: '세금·연금',
    mission: '세금·ISA·연금·계좌 제도의 확정 단계와 개인 자산 영향을 구분해 분석한다.',
    aliases: ['세금 전문가', '세무 전문가', '연금 전문가', '세금·연금 전문가', '절세 전문가'],
    keywords: ['세금', '세제', '절세', 'ISA', '연금', '퇴직연금', '양도세', '보유세', '종부세', '공제'],
    contextScopes: ['portfolio', 'freedom_goal', 'tax_policy', 'recent_trades'],
    reviewerCandidates: ['portfolio_manager', 'risk_manager'],
  }),
  portfolio_manager: Object.freeze({
    id: 'portfolio_manager',
    name: '포트폴리오 관리자',
    shortName: '포트폴리오',
    mission: '순자산·현금·자산배분과 경제적 자유 목표의 일관성을 관리한다.',
    aliases: ['포트폴리오 관리자', '포트폴리오 전문가', '자산 관리자', '자산배분 전문가'],
    keywords: ['포트폴리오', '자산배분', '순자산', '현금 비중', '보유 비중', '리밸런싱', '경제적 자유', '목표 달성'],
    contextScopes: ['portfolio', 'freedom_goal', 'risk_policy', 'recent_trades'],
    reviewerCandidates: ['risk_manager', 'data_auditor'],
  }),
  risk_manager: Object.freeze({
    id: 'risk_manager',
    name: '리스크 관리자',
    shortName: '리스크',
    mission: '제안의 반대 근거, 최대 손실, 무효화 조건과 데이터 공백을 독립적으로 점검한다.',
    aliases: ['리스크 관리자', '위험 관리자', '리스크 전문가', '반대 검토자'],
    keywords: ['리스크', '위험', '손실', '손절', '최대낙폭', 'MDD', '무효화', '반대 의견'],
    contextScopes: ['portfolio', 'recommendations', 'risk_policy', 'recent_trades'],
    reviewerCandidates: ['data_auditor'],
  }),
  data_auditor: Object.freeze({
    id: 'data_auditor',
    name: '데이터 검증 담당',
    shortName: '데이터 검증',
    mission: '수치·출처·기준 시점·결측과 사실/추론의 경계를 검증한다.',
    aliases: ['데이터 검증 담당', '데이터 전문가', '데이터 검증자', '팩트체커', '팩트 체크'],
    keywords: ['데이터', '근거', '출처', '팩트체크', '팩트 체크', '기준 시점', '정확한지', '검증'],
    contextScopes: ['portfolio', 'recommendations', 'recent_trades', 'all_policy'],
    reviewerCandidates: [],
  }),
});

const ROUTING_PRIORITY = Object.freeze([
  'real_estate',
  'tax_pension',
  'investment',
  'portfolio_manager',
  'risk_manager',
  'data_auditor',
]);

const DECISION_REVIEW_PATTERN = /(?:사도|살까|매수|매도|팔까|투자할|추천|비중|배분|리밸런싱|대출|청약|계약|매입|가입|해지|절세|선택|결정|실행|행동)/i;

function normalizeExpertText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function roleByAlias(value = '') {
  const normalized = normalizeExpertText(value).toLowerCase();
  if (!normalized) return null;
  return Object.values(EXPERT_ROLES).find(role => (
    role.id === normalized
    || role.name.toLowerCase() === normalized
    || role.shortName.toLowerCase() === normalized
    || role.aliases.some(alias => alias.toLowerCase() === normalized)
  )) || null;
}

function findMentionedRoles(text = '') {
  const normalized = normalizeExpertText(text).toLowerCase();
  return ROUTING_PRIORITY
    .map(id => EXPERT_ROLES[id])
    .filter(role => [role.name, role.shortName, ...role.aliases]
      .some(alias => normalized.includes(alias.toLowerCase())));
}

function findExplicitlyNamedRoles(text = '') {
  const normalized = normalizeExpertText(text).toLowerCase();
  return ROUTING_PRIORITY
    .map(id => EXPERT_ROLES[id])
    .filter(role => [role.name, ...role.aliases]
      .some(alias => normalized.includes(alias.toLowerCase())));
}

function explicitToRole(text = '') {
  const match = normalizeExpertText(text).match(/(?:^|\s)(?:to|담당)\s*[:：]\s*([^,\n]+)/i);
  if (!match) return null;
  const segment = match[1].trim();
  return Object.values(EXPERT_ROLES).find(role => (
    [role.name, role.shortName, ...role.aliases].some(alias => segment.includes(alias))
  )) || null;
}

function explicitCcRoles(text = '') {
  const match = normalizeExpertText(text).match(/(?:^|\s)cc\s*[:：]\s*(.+?)(?=(?:\s+(?:질문|요청)\s*[:：])|$)/i);
  if (!match) return [];
  return findMentionedRoles(match[1]);
}

function scoreRole(text, role) {
  const normalized = normalizeExpertText(text).toLowerCase();
  const aliasHits = [role.name, role.shortName, ...role.aliases]
    .filter(alias => normalized.includes(alias.toLowerCase())).length;
  const keywordHits = role.keywords
    .filter(keyword => normalized.includes(keyword.toLowerCase())).length;
  return aliasHits * 100 + keywordHits * 10;
}

function clampReviewerCount(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(2, parsed));
}

function classifyExpertRequest(text = '', options = {}) {
  const normalized = normalizeExpertText(text);
  if (!normalized) return null;
  const direct = explicitToRole(normalized);
  const explicitlyNamed = findExplicitlyNamedRoles(normalized);
  const scores = ROUTING_PRIORITY.map((id, priority) => ({
    role: EXPERT_ROLES[id],
    score: scoreRole(normalized, EXPERT_ROLES[id]),
    priority,
  })).filter(item => item.score > 0);
  const primary = direct || scores.sort((a, b) => b.score - a.score || a.priority - b.priority)[0]?.role;
  if (!primary) return null;

  const maxReviewers = clampReviewerCount(options.maxReviewers, 1);
  const explicitCc = explicitCcRoles(normalized).filter(role => role.id !== primary.id);
  const reviewNeeded = explicitCc.length > 0 || DECISION_REVIEW_PATTERN.test(normalized);
  const candidateIds = explicitCc.length > 0
    ? explicitCc.map(role => role.id)
    : (reviewNeeded ? primary.reviewerCandidates : []);
  const reviewers = [...new Set(candidateIds)]
    .filter(id => id !== primary.id && EXPERT_ROLES[id])
    .slice(0, maxReviewers)
    .map(id => EXPERT_ROLES[id]);

  return {
    coordinator: 'chief_of_staff',
    primary,
    reviewers,
    reviewNeeded,
    source: direct ? 'explicit_to' : (explicitlyNamed.length > 0 ? 'explicit_role' : 'keyword'),
  };
}

module.exports = {
  DECISION_REVIEW_PATTERN,
  EXPERT_ROLES,
  ROUTING_PRIORITY,
  clampReviewerCount,
  classifyExpertRequest,
  explicitCcRoles,
  explicitToRole,
  findExplicitlyNamedRoles,
  findMentionedRoles,
  normalizeExpertText,
  roleByAlias,
  scoreRole,
};
