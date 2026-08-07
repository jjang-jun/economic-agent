const ASSEMBLY_BILL_ENDPOINT = 'https://open.assembly.go.kr/portal/openapi/TVBPMBILL11';
const { formatNetworkError } = require('../utils/network-error');

const DEFAULT_POLICY_BILL_TERMS = [
  '조세특례제한법',
  '소득세법',
  '상속세 및 증여세법',
  '종합부동산세법',
  '주택법',
  '주택임대차보호법',
  '자본시장과 금융투자업에 관한 법률',
  '국민연금법',
];

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

function policyBillTerms(value = process.env.OPEN_ASSEMBLY_BILL_TERMS) {
  if (!value) return DEFAULT_POLICY_BILL_TERMS;
  const terms = String(value).split(',').map(item => item.trim()).filter(Boolean);
  return terms.length > 0 ? [...new Set(terms)] : DEFAULT_POLICY_BILL_TERMS;
}

function assemblyOptions(options = {}) {
  return {
    apiKey: options.apiKey || process.env.OPEN_ASSEMBLY_API_KEY || '',
    age: String(options.age || process.env.OPEN_ASSEMBLY_AGE || '22'),
    terms: options.terms || policyBillTerms(),
    pageSize: positiveInteger(options.pageSize || process.env.OPEN_ASSEMBLY_PAGE_SIZE, 100, 1_000),
    timeoutMs: positiveInteger(options.timeoutMs || process.env.OPEN_ASSEMBLY_TIMEOUT_MS, 15_000, 60_000),
  };
}

function buildAssemblyBillUrl(term, options = {}) {
  const config = assemblyOptions(options);
  const url = new URL(ASSEMBLY_BILL_ENDPOINT);
  url.searchParams.set('KEY', config.apiKey);
  url.searchParams.set('Type', 'json');
  url.searchParams.set('pIndex', String(positiveInteger(options.pageIndex, 1)));
  url.searchParams.set('pSize', String(config.pageSize));
  url.searchParams.set('AGE', config.age);
  url.searchParams.set('BILL_NAME', term);
  return url;
}

function parseAssemblyTotalCount(payload = {}) {
  const dataset = payload.TVBPMBILL11;
  if (!Array.isArray(dataset)) return 0;
  const count = dataset
    .flatMap(section => section?.head || [])
    .find(item => Number.isFinite(Number(item?.list_total_count)))?.list_total_count;
  return Math.max(0, Number(count) || 0);
}

function parseAssemblyRows(payload = {}) {
  if (payload.RESULT?.CODE) {
    throw new Error(`${payload.RESULT.CODE}: ${payload.RESULT.MESSAGE || '열린국회정보 API 오류'}`);
  }
  const dataset = payload.TVBPMBILL11;
  if (!Array.isArray(dataset)) return [];
  const error = dataset
    .flatMap(section => section?.head || [])
    .find(item => item?.RESULT && item.RESULT.CODE !== 'INFO-000')?.RESULT;
  if (error) throw new Error(`${error.CODE}: ${error.MESSAGE || '열린국회정보 API 오류'}`);
  const rowSection = dataset.find(section => Array.isArray(section?.row));
  return rowSection?.row || [];
}

function compactParts(parts = []) {
  return parts.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('. ');
}

function assemblyBillStage(row = {}) {
  if (row.PROM_DT || row.PROM_LAW_NM || row.PROM_NO) return 'promulgated';
  if (/가결|통과|의결/u.test(row.PROC_RESULT_CD || '')) return 'passed';
  return 'submitted';
}

function assemblyBillDocument(row = {}) {
  const stage = assemblyBillStage(row);
  const title = row.BILL_NAME || '';
  const policyGroupTitle = title
    .replace(/(?:일부|전부)개정법률안$/u, '')
    .replace(/폐지법률안$/u, '')
    .replace(/법률안$/u, '')
    .trim();
  const latestDate = row.PROM_DT || row.PROC_DT || row.LAW_PROC_DT
    || row.CMT_PROC_DT || row.COMMITTEE_PROC_DT || row.PROPOSE_DT || null;
  return {
    externalId: row.BILL_ID || row.BILL_NO || '',
    title,
    policyGroupTitle,
    summary: compactParts([
      ['의안번호', row.BILL_NO],
      ['제안자', row.PROPOSER || row.RST_PROPOSER],
      ['제안일', row.PROPOSE_DT],
      ['소관위원회', row.CURR_COMMITTEE],
      ['소관위 처리', row.CMT_PROC_RESULT_CD || row.COMMITTEE_PROC_DT],
      ['법사위 처리', row.LAW_PROC_RESULT_CD || row.LAW_PROC_DT],
      ['본회의 결과', row.PROC_RESULT_CD],
      ['공포 법률', row.PROM_LAW_NM],
      ['공포일', row.PROM_DT],
      ['공포번호', row.PROM_NO],
    ]),
    link: row.LINK_URL || '',
    pubDate: latestDate,
    sourceId: 'open-assembly-bills',
    authority: '대한민국 국회',
    sourceKind: 'assembly_bill',
    stage,
    legislative: {
      billId: row.BILL_ID || '',
      billNo: row.BILL_NO || '',
      age: row.AGE || '',
      proposer: row.PROPOSER || row.RST_PROPOSER || '',
      proposerKind: row.PROPOSER_KIND || '',
      committee: row.CURR_COMMITTEE || '',
      committeeResult: row.CMT_PROC_RESULT_CD || '',
      lawCommitteeResult: row.LAW_PROC_RESULT_CD || '',
      plenaryResult: row.PROC_RESULT_CD || '',
      promulgationDate: row.PROM_DT || '',
      promulgationNo: row.PROM_NO || '',
    },
  };
}

function isImportantAssemblyBill(document = {}, options = {}) {
  if (options.includeMemberSubmitted === true) return true;
  const proposerKind = document.legislative?.proposerKind || '';
  if (proposerKind === '정부') return true;
  return document.stage === 'passed' || document.stage === 'promulgated';
}

async function fetchAssemblyTerm(term, options = {}) {
  const config = assemblyOptions(options);
  const fetcher = options.fetcher || fetch;
  const fetchPage = async pageIndex => {
    try {
      const response = await fetcher(buildAssemblyBillUrl(term, { ...config, pageIndex }), {
        headers: { 'User-Agent': 'economic-agent/2.0 policy-radar' },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText || ''}`.trim());
      return response.json();
    } catch (error) {
      throw new Error(formatNetworkError(error));
    }
  };

  const firstPayload = await fetchPage(1);
  const documents = parseAssemblyRows(firstPayload).map(assemblyBillDocument);
  const totalCount = parseAssemblyTotalCount(firstPayload);
  const pageCount = Math.ceil(totalCount / config.pageSize);
  for (let pageIndex = 2; pageIndex <= pageCount; pageIndex += 1) {
    const payload = await fetchPage(pageIndex);
    documents.push(...parseAssemblyRows(payload).map(assemblyBillDocument));
  }
  return documents;
}

async function fetchAssemblyPolicyDocuments(options = {}) {
  const config = assemblyOptions(options);
  if (!config.apiKey) return { documents: [], sourceResults: [], skipped: true };

  const results = await Promise.allSettled(
    config.terms.map(term => fetchAssemblyTerm(term, { ...options, ...config }))
  );
  const documents = [];
  const errors = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') documents.push(...result.value);
    else errors.push(`${config.terms[index]}: ${result.reason?.message || String(result.reason)}`);
  });
  const deduplicated = [...new Map(documents.map(item => [item.externalId || item.link, item])).values()];
  const important = deduplicated.filter(item => isImportantAssemblyBill(item, options));
  const ok = results.some(result => result.status === 'fulfilled');
  return {
    documents: important,
    sourceResults: [{
      id: 'open-assembly-bills',
      authority: '대한민국 국회',
      sourceKind: 'assembly_bill',
      ok,
      count: important.length,
      fetchedCount: deduplicated.length,
      error: errors.join(' | '),
    }],
    skipped: false,
  };
}

module.exports = {
  ASSEMBLY_BILL_ENDPOINT,
  DEFAULT_POLICY_BILL_TERMS,
  policyBillTerms,
  assemblyOptions,
  buildAssemblyBillUrl,
  parseAssemblyTotalCount,
  parseAssemblyRows,
  assemblyBillStage,
  assemblyBillDocument,
  isImportantAssemblyBill,
  fetchAssemblyTerm,
  fetchAssemblyPolicyDocuments,
};
