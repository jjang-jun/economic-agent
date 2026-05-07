const { getKSTDate } = require('../utils/article-archive');

const DART_API_KEY = process.env.DART_API_KEY;
const BASE_URL = 'https://opendart.fss.or.kr/api';
const IMPORTANT_REPORTS = [
  '주요사항보고서',
  '증권신고서',
  '영업실적',
  '잠정실적',
  '공급계약',
  '단일판매',
  '자기주식',
  '유상증자',
  '무상증자',
  '전환사채',
  '신주인수권',
  '합병',
  '분할',
  '최대주주',
  '조회공시',
  '불성실공시',
];

function toDartDate(date) {
  return date.replace(/-/g, '');
}

function getDateDaysAgo(days) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  return getKSTDate(now);
}

function isImportantDisclosure(reportName) {
  return IMPORTANT_REPORTS.some(keyword => reportName.includes(keyword));
}

function buildDisclosureLink(rceptNo) {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(rceptNo)}`;
}

function normalizeDisclosure(item) {
  const reportName = item.report_nm || '';
  const companyName = item.corp_name || '';
  const stockCode = item.stock_code || '';
  const title = `[공시] ${companyName} ${reportName}`;

  return {
    id: `dart:${item.rcept_no}`,
    title,
    summary: `${companyName} ${stockCode} ${reportName}`.trim(),
    link: buildDisclosureLink(item.rcept_no),
    pubDate: item.rcept_dt
      ? `${item.rcept_dt.slice(0, 4)}-${item.rcept_dt.slice(4, 6)}-${item.rcept_dt.slice(6, 8)}T00:00:00+09:00`
      : new Date().toISOString(),
    pubDatePrecision: item.rcept_dt ? 'date' : 'datetime',
    source: 'DART',
    highPriority: isImportantDisclosure(reportName),
    disclosure: {
      corpName: companyName,
      stockCode,
      corpCode: item.corp_code || '',
      reportName,
      receiptNo: item.rcept_no,
      receiptDate: item.rcept_dt || '',
      market: item.corp_cls || '',
    },
  };
}

async function fetchDartDisclosures(options = {}) {
  if (!DART_API_KEY) {
    console.warn('[DART] API 키가 설정되지 않았습니다.');
    return [];
  }

  const endDate = options.endDate || getKSTDate();
  const startDate = options.startDate || getDateDaysAgo(options.days || 1);
  const pageCount = options.pageCount || 100;

  try {
    const params = new URLSearchParams({
      crtfc_key: DART_API_KEY,
      bgn_de: toDartDate(startDate),
      end_de: toDartDate(endDate),
      page_count: String(pageCount),
      page_no: '1',
    });
    const url = `${BASE_URL}/list.json?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.status !== '000') {
      if (data.status === '013') return [];
      throw new Error(`${data.status} ${data.message || ''}`.trim());
    }

    return (data.list || []).map(normalizeDisclosure);
  } catch (err) {
    console.warn(`[DART] 공시 수집 실패: ${err.message}`);
    return [];
  }
}

module.exports = { fetchDartDisclosures, normalizeDisclosure, isImportantDisclosure };
