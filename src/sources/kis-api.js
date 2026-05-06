const KIS_BASE_URL = process.env.KIS_BASE_URL || 'https://openapi.koreainvestment.com:9443';
const KIS_APP_KEY = process.env.KIS_APP_KEY || process.env.KIS_APPKEY || '';
const KIS_APP_SECRET = process.env.KIS_APP_SECRET || process.env.KIS_APPSECRET || '';

let tokenCache = {
  accessToken: process.env.KIS_ACCESS_TOKEN || '',
  expiresAt: 0,
};

function isKisConfigured() {
  return Boolean((tokenCache.accessToken || (KIS_APP_KEY && KIS_APP_SECRET)) && KIS_BASE_URL);
}

function normalizeKisTicker(ticker) {
  const match = String(ticker || '').trim().toUpperCase().match(/^(\d{6})(?:\.(?:KS|KQ))?$/);
  return match ? match[1] : '';
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const num = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

async function getAccessToken() {
  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }
  if (process.env.KIS_ACCESS_TOKEN && !KIS_APP_KEY && !KIS_APP_SECRET) {
    return process.env.KIS_ACCESS_TOKEN;
  }
  if (!KIS_APP_KEY || !KIS_APP_SECRET) return '';

  const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`KIS token HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (!data.access_token) throw new Error('KIS token missing');
  const expiresIn = Number(data.expires_in || 0);
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : Date.now() + (23 * 60 * 60 * 1000),
  };
  return tokenCache.accessToken;
}

function getAuthHeaders(accessToken, trId) {
  return {
    authorization: `Bearer ${accessToken}`,
    appkey: KIS_APP_KEY,
    appsecret: KIS_APP_SECRET,
    tr_id: trId,
    custtype: 'P',
    'Content-Type': 'application/json',
  };
}

async function fetchKisCurrentPrice(ticker) {
  const code = normalizeKisTicker(ticker);
  if (!code || !isKisConfigured()) return null;

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return null;

    const url = new URL('/uapi/domestic-stock/v1/quotations/inquire-price', KIS_BASE_URL);
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
    url.searchParams.set('FID_INPUT_ISCD', code);

    const res = await fetch(url, {
      headers: getAuthHeaders(accessToken, 'FHKST01010100'),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const row = data.output || {};
    const price = parseNumber(row.stck_prpr);
    if (typeof price !== 'number') throw new Error('no current price');

    const previousClose = parseNumber(row.stck_sdpr);
    const changePercent = parseNumber(row.prdy_ctrt);
    const volume = parseNumber(row.acml_vol);
    const tradingValue = parseNumber(row.acml_tr_pbmn);

    return {
      symbol: `${code}.KS`,
      ticker: code,
      name: row.hts_kor_isnm || '',
      price,
      previousClose,
      changePercent,
      volume,
      averageTurnover20d: tradingValue,
      currency: 'KRW',
      market: 'KR',
      priceType: 'current',
      isRealtime: true,
      isAdjusted: false,
      marketTime: new Date().toISOString(),
      source: 'kis-rest',
      raw: row,
    };
  } catch (err) {
    console.warn(`[KIS] ${code} 현재가 조회 실패: ${err.message}`);
    return null;
  }
}

async function fetchKisDailyOhlcv(ticker, from, to) {
  const code = normalizeKisTicker(ticker);
  if (!code || !isKisConfigured()) return [];

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return [];

    const url = new URL('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice', KIS_BASE_URL);
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
    url.searchParams.set('FID_INPUT_ISCD', code);
    url.searchParams.set('FID_INPUT_DATE_1', String(from || '').replace(/-/g, ''));
    url.searchParams.set('FID_INPUT_DATE_2', String(to || '').replace(/-/g, ''));
    url.searchParams.set('FID_PERIOD_DIV_CODE', 'D');
    url.searchParams.set('FID_ORG_ADJ_PRC', '0');

    const res = await fetch(url, {
      headers: getAuthHeaders(accessToken, 'FHKST03010100'),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    return (data.output2 || []).map(row => ({
      date: row.stck_bsop_date,
      open: parseNumber(row.stck_oprc),
      high: parseNumber(row.stck_hgpr),
      low: parseNumber(row.stck_lwpr),
      close: parseNumber(row.stck_clpr),
      volume: parseNumber(row.acml_vol),
      tradingValue: parseNumber(row.acml_tr_pbmn),
      source: 'kis-rest',
    }));
  } catch (err) {
    console.warn(`[KIS] ${code} 일봉 조회 실패: ${err.message}`);
    return [];
  }
}

module.exports = {
  isKisConfigured,
  normalizeKisTicker,
  fetchKisCurrentPrice,
  fetchKisDailyOhlcv,
};
