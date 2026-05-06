const DEFAULT_URL = 'https://finance.naver.com/sise/investorDealTrendDay.naver';

function toYYYYMMDD(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/-/g, '');
}

function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function parseNumber(value) {
  const cleaned = stripTags(value).replace(/,/g, '');
  if (!cleaned || cleaned === '-') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseDate(value) {
  const text = stripTags(value);
  const match = text.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!match) return null;
  const [, yy, mm, dd] = match;
  const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  return `${year}-${mm}-${dd}`;
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + (typeof row[key] === 'number' ? row[key] : 0), 0);
}

function parseInvestorRows(html) {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?<td[^>]*class=["']date2["'][\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
    if (cells.length < 11) continue;

    const date = parseDate(cells[0]);
    if (!date) continue;

    rows.push({
      date,
      individual: parseNumber(cells[1]),
      foreign: parseNumber(cells[2]),
      institution: parseNumber(cells[3]),
      financialInvestment: parseNumber(cells[4]),
      insurance: parseNumber(cells[5]),
      investmentTrust: parseNumber(cells[6]),
      bank: parseNumber(cells[7]),
      otherFinancial: parseNumber(cells[8]),
      pension: parseNumber(cells[9]),
      otherCorp: parseNumber(cells[10]),
    });
  }

  return rows;
}

async function fetchInvestorFlow({ date = toYYYYMMDD(), market = 'KOSPI' } = {}) {
  const url = new URL(DEFAULT_URL);
  url.searchParams.set('bizdate', date);
  url.searchParams.set('sosok', '');
  url.searchParams.set('page', '1');

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 economic-agent',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    const buffer = await res.arrayBuffer();
    const html = new TextDecoder('euc-kr').decode(buffer);
    const recent = parseInvestorRows(html).slice(0, 10);
    const latest = recent[0];
    if (!latest) throw new Error('투자자 수급 표를 찾지 못했습니다');

    const last5 = recent.slice(0, 5);
    return {
      source: 'naver-finance',
      sourceUrl: url.toString(),
      market,
      unit: '억원',
      latest,
      recent,
      sums5d: {
        individual: sum(last5, 'individual'),
        foreign: sum(last5, 'foreign'),
        institution: sum(last5, 'institution'),
        pension: sum(last5, 'pension'),
      },
    };
  } catch (err) {
    console.warn(`[NaverInvestor] 수급 조회 실패: ${err.message}`);
    return null;
  }
}

module.exports = {
  fetchInvestorFlow,
  parseInvestorRows,
};
