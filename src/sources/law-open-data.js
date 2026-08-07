const { DEFAULT_POLICY_BILL_TERMS } = require('./assembly-bills');
const { formatNetworkError } = require('../utils/network-error');

const LAW_SEARCH_ENDPOINT = 'https://www.law.go.kr/DRF/lawSearch.do';

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

function lawOpenDataOptions(options = {}) {
  return {
    oc: options.oc || process.env.LAW_OPEN_DATA_OC || '',
    terms: options.terms || DEFAULT_POLICY_BILL_TERMS,
    display: positiveInteger(options.display || process.env.LAW_OPEN_DATA_DISPLAY, 100, 100),
    timeoutMs: positiveInteger(options.timeoutMs || process.env.LAW_OPEN_DATA_TIMEOUT_MS, 15_000, 60_000),
    now: options.now || new Date(),
  };
}

function buildLawSearchUrl(term, options = {}) {
  const config = lawOpenDataOptions(options);
  const url = new URL(LAW_SEARCH_ENDPOINT);
  url.searchParams.set('OC', config.oc);
  url.searchParams.set('target', 'law');
  url.searchParams.set('type', 'JSON');
  url.searchParams.set('search', '1');
  url.searchParams.set('query', term);
  url.searchParams.set('display', String(config.display));
  url.searchParams.set('page', '1');
  url.searchParams.set('sort', 'ddes');
  return url;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === 'object' ? [value] : [];
}

function parseLawRows(payload = {}) {
  const root = payload.LawSearch || payload.lawSearch || payload;
  const code = root.resultCode || root.RESULT?.CODE || root.result?.code;
  if (code && !['00', '0', 'INFO-000'].includes(String(code))) {
    throw new Error(`${code}: ${root.resultMsg || root.RESULT?.MESSAGE || '국가법령정보 API 오류'}`);
  }
  return asArray(root.law || root.Law || root.법령);
}

function compactDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 8) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function normalizeLawName(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function lawRowValue(row = {}, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return '';
}

function normalizeLawLink(value = '') {
  if (!value) return '';
  try {
    return new URL(String(value), 'https://www.law.go.kr').href;
  } catch {
    return '';
  }
}

function lawStage(effectiveDate, now = new Date()) {
  if (!effectiveDate) return 'promulgated';
  const effectiveAt = Date.parse(`${effectiveDate}T00:00:00+09:00`);
  return Number.isFinite(effectiveAt) && effectiveAt <= now.getTime() ? 'effective' : 'promulgated';
}

function lawDocument(row = {}, options = {}) {
  const title = String(lawRowValue(row, '법령명한글', '법령명_한글', '법령명') || '').replace(/<[^>]+>/g, '').trim();
  const lawId = String(lawRowValue(row, '법령ID', '법령아이디', 'lawId') || '');
  const masterId = String(lawRowValue(row, '법령일련번호', '법령일련번호값', 'MST') || '');
  const promulgationDate = compactDate(lawRowValue(row, '공포일자', '공포일'));
  const effectiveDate = compactDate(lawRowValue(row, '시행일자', '시행일'));
  const promulgationNo = String(lawRowValue(row, '공포번호', '공포번호값') || '');
  const revisionKind = String(lawRowValue(row, '제개정구분명', '제개정구분') || '');
  const ministry = String(lawRowValue(row, '소관부처명', '소관부처') || '');
  const stage = lawStage(effectiveDate, options.now || new Date());
  const summary = [
    promulgationDate && `공포일: ${promulgationDate}`,
    promulgationNo && `공포번호: ${promulgationNo}`,
    effectiveDate && `시행일: ${effectiveDate}`,
    revisionKind && `제·개정: ${revisionKind}`,
    ministry && `소관부처: ${ministry}`,
  ].filter(Boolean).join('. ');
  return {
    externalId: lawId || masterId || title,
    policyGroupTitle: title,
    title,
    summary,
    link: normalizeLawLink(lawRowValue(row, '법령상세링크', '상세링크')),
    pubDate: promulgationDate || effectiveDate || null,
    sourceId: 'law-open-data',
    authority: '법제처 국가법령정보센터',
    sourceKind: 'statute',
    stage,
    statute: {
      lawId,
      masterId,
      lawName: title,
      promulgationDate,
      promulgationNo,
      effectiveDate,
      revisionKind,
      ministry,
      effective: stage === 'effective',
    },
  };
}

async function fetchLawTerm(term, options = {}) {
  const config = lawOpenDataOptions(options);
  const fetcher = options.fetcher || fetch;
  let response;
  try {
    response = await fetcher(buildLawSearchUrl(term, config), {
      headers: { 'User-Agent': 'economic-agent/2.0 policy-radar' },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText || ''}`.trim());
  } catch (error) {
    throw new Error(formatNetworkError(error));
  }
  const rows = parseLawRows(await response.json());
  const normalizedTerm = normalizeLawName(term);
  return rows
    .filter(row => normalizeLawName(lawRowValue(row, '법령명한글', '법령명_한글', '법령명')) === normalizedTerm)
    .map(row => lawDocument(row, { now: config.now }));
}

async function fetchLawPolicyDocuments(options = {}) {
  const config = lawOpenDataOptions(options);
  if (!config.oc) return { documents: [], sourceResults: [], skipped: true };
  const results = await Promise.allSettled(
    config.terms.map(term => fetchLawTerm(term, { ...options, ...config }))
  );
  const documents = [];
  const errors = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') documents.push(...result.value);
    else errors.push(`${config.terms[index]}: ${result.reason?.message || String(result.reason)}`);
  });
  const deduplicated = [...new Map(documents.map(item => [item.externalId, item])).values()];
  const ok = results.some(result => result.status === 'fulfilled');
  return {
    documents: deduplicated,
    sourceResults: [{
      id: 'law-open-data', authority: '법제처 국가법령정보센터', sourceKind: 'statute',
      ok, count: deduplicated.length, error: errors.join(' | '),
    }],
    skipped: false,
  };
}

module.exports = {
  LAW_SEARCH_ENDPOINT,
  lawOpenDataOptions,
  buildLawSearchUrl,
  parseLawRows,
  compactDate,
  normalizeLawName,
  lawStage,
  lawDocument,
  fetchLawTerm,
  fetchLawPolicyDocuments,
};
