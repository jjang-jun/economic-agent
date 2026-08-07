const crypto = require('crypto');

const ENDPOINTS = Object.freeze({
  trade: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
  rent: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
});

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function tagValue(xml, ...names) {
  for (const name of names) {
    const match = String(xml).match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return decodeXml(match[1]);
  }
  return '';
}

function parseItems(xml = '') {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
}

function parseManwon(value) {
  const amount = Number(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(amount) ? Math.round(amount * 10_000) : 0;
}

function parseNumber(value) {
  const number = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function isoDate(year, month, day) {
  const values = [year, month, day].map(value => Number(value));
  if (!values.every(Number.isInteger) || values[0] < 1900 || values[1] < 1 || values[2] < 1) return null;
  return `${String(values[0]).padStart(4, '0')}-${String(values[1]).padStart(2, '0')}-${String(values[2]).padStart(2, '0')}`;
}

function normalizeCompactDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(digits)) return null;
  return isoDate(digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8));
}

function stableId(prefix, identity) {
  return `${prefix}:${crypto.createHash('sha256').update(identity.join('|')).digest('hex').slice(0, 32)}`;
}

function normalizeServiceKey(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeCommon(item, lawdCode) {
  const year = tagValue(item, 'dealYear', '년');
  const month = tagValue(item, 'dealMonth', '월');
  const day = tagValue(item, 'dealDay', '일');
  return {
    lawd_code: tagValue(item, 'sggCd') || String(lawdCode),
    province_name: tagValue(item, 'estateAgentSidoNm', 'sidoNm', '시도명') || null,
    district_name: tagValue(item, 'estateAgentSggNm', 'sggNm', '시군구명') || null,
    neighborhood_name: tagValue(item, 'umdNm', '법정동'),
    apartment_name: tagValue(item, 'aptNm', '아파트'),
    parcel_address: tagValue(item, 'jibun', '지번'),
    exclusive_area_sqm: parseNumber(tagValue(item, 'excluUseAr', '전용면적')),
    floor: parseNumber(tagValue(item, 'floor', '층')),
    built_year: parseNumber(tagValue(item, 'buildYear', '건축년도')),
    contract_date: isoDate(year, month, day),
  };
}

function normalizeTrade(item, lawdCode, duplicateOrdinal = 0) {
  const common = normalizeCommon(item, lawdCode);
  const priceKrw = parseManwon(tagValue(item, 'dealAmount', '거래금액'));
  const identity = [
    common.lawd_code, common.neighborhood_name, common.apartment_name, common.parcel_address,
    common.exclusive_area_sqm, common.floor, common.contract_date, priceKrw, duplicateOrdinal,
  ];
  const cancellationFlag = tagValue(item, 'cdealType', '해제여부');
  return {
    id: stableId('molit-trade', identity),
    source: 'molit_rtms',
    ...common,
    price_krw: priceKrw,
    cancelled: /^(?:O|Y|1|해제)$/i.test(cancellationFlag),
    cancellation_date: normalizeCompactDate(tagValue(item, 'cdealDay', '해제사유발생일')),
    dealing_type: tagValue(item, 'dealingGbn', '거래유형') || null,
    observed_at: new Date().toISOString(),
    payload: {
      apartmentDong: tagValue(item, 'aptDong', '아파트동명'),
      registrationDate: tagValue(item, 'rgstDate', '등기일자'),
      buyerType: tagValue(item, 'buyerGbn', '매수자'),
      sellerType: tagValue(item, 'slerGbn', '매도자'),
    },
  };
}

function normalizeRent(item, lawdCode, duplicateOrdinal = 0) {
  const common = normalizeCommon(item, lawdCode);
  const depositKrw = parseManwon(tagValue(item, 'deposit', '보증금액'));
  const monthlyRentKrw = parseManwon(tagValue(item, 'monthlyRent', '월세금액'));
  const identity = [
    common.lawd_code, common.neighborhood_name, common.apartment_name, common.parcel_address,
    common.exclusive_area_sqm, common.floor, common.contract_date, depositKrw, monthlyRentKrw,
    tagValue(item, 'contractTerm', '계약기간'), duplicateOrdinal,
  ];
  return {
    id: stableId('molit-rent', identity),
    source: 'molit_rtms',
    ...common,
    rent_type: monthlyRentKrw > 0 ? 'monthly' : 'jeonse',
    deposit_krw: depositKrw,
    monthly_rent_krw: monthlyRentKrw,
    contract_type: tagValue(item, 'contractType', '계약구분') || null,
    contract_term: tagValue(item, 'contractTerm', '계약기간') || null,
    renewal_right_used: /갱신|사용/i.test(tagValue(item, 'useRRRight', '갱신요구권사용')),
    observed_at: new Date().toISOString(),
    payload: {
      previousDepositKrw: parseManwon(tagValue(item, 'preDeposit', '종전계약보증금')),
      previousMonthlyRentKrw: parseManwon(tagValue(item, 'preMonthlyRent', '종전계약월세')),
    },
  };
}

function assignDuplicateOrdinals(items, normalizer, lawdCode) {
  const counts = new Map();
  return items.map(item => {
    const probe = normalizer(item, lawdCode, 0);
    const key = probe.id;
    const ordinal = counts.get(key) || 0;
    counts.set(key, ordinal + 1);
    return ordinal === 0 ? probe : normalizer(item, lawdCode, ordinal);
  });
}

function assertApiResponse(xml) {
  const code = tagValue(xml, 'resultCode');
  if (code && !['00', '000', '0000'].includes(code)) {
    throw new Error(`MOLIT API ${code}: ${tagValue(xml, 'resultMsg') || 'unknown error'}`);
  }
}

async function fetchMolitApartmentData(kind, options = {}) {
  if (!ENDPOINTS[kind]) throw new Error(`Unsupported MOLIT real-estate kind: ${kind}`);
  const serviceKey = options.serviceKey
    || process.env.PUBLIC_DATA_API_KEY
    || process.env.DATA_GO_KR_API_KEY
    || process.env.MOLIT_API_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_API_KEY is required for MOLIT real-estate collection');
  const lawdCode = String(options.lawdCode || '');
  const dealYmd = String(options.dealYmd || '');
  if (!/^\d{5}$/.test(lawdCode)) throw new Error(`Invalid LAWD code: ${lawdCode}`);
  if (!/^\d{6}$/.test(dealYmd)) throw new Error(`Invalid deal month: ${dealYmd}`);

  const url = new URL(options.endpoint || ENDPOINTS[kind]);
  url.searchParams.set('serviceKey', normalizeServiceKey(serviceKey));
  url.searchParams.set('LAWD_CD', lawdCode);
  url.searchParams.set('DEAL_YMD', dealYmd);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', String(options.numOfRows || 9999));
  const fetcher = options.fetcher || fetch;
  const timeoutMs = Math.max(1_000, Number(options.timeoutMs || process.env.REAL_ESTATE_REQUEST_TIMEOUT_MS || 20_000));
  const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`MOLIT ${kind} request failed: ${response.status}`);
  const xml = await response.text();
  assertApiResponse(xml);
  const items = parseItems(xml);
  return assignDuplicateOrdinals(items, kind === 'trade' ? normalizeTrade : normalizeRent, lawdCode);
}

module.exports = {
  ENDPOINTS,
  assertApiResponse,
  decodeXml,
  fetchMolitApartmentData,
  isoDate,
  normalizeCompactDate,
  normalizeServiceKey,
  normalizeRent,
  normalizeTrade,
  parseItems,
  parseManwon,
  tagValue,
};
