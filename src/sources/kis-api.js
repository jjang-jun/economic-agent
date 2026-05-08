const fs = require('fs');
const path = require('path');

function normalizeKisBaseUrl(url) {
  return String(url || 'https://openapi.koreainvestment.com:9443')
    .trim()
    .replace('koreaninvestment.com', 'koreainvestment.com');
}

const KIS_BASE_URL = normalizeKisBaseUrl(process.env.KIS_BASE_URL);
const KIS_APP_KEY = process.env.KIS_APP_KEY || process.env.KIS_APPKEY || '';
const KIS_APP_SECRET = process.env.KIS_APP_SECRET || process.env.KIS_APPSECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REMOTE_TOKEN_PROVIDER = 'kis-rest';

let tokenCache = {
  accessToken: process.env.KIS_ACCESS_TOKEN || '',
  expiresAt: 0,
};
let tokenPromise = null;
let lastRequestAt = 0;
let requestQueue = Promise.resolve();
const TOKEN_CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'kis-token.json');

function loadTokenCache() {
  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache;
  try {
    const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf-8'));
    if (cached.accessToken && cached.expiresAt > Date.now() + 60_000) {
      tokenCache = cached;
    }
  } catch {
    // Local cache is optional.
  }
  return tokenCache;
}

function saveTokenCache(cache) {
  try {
    fs.mkdirSync(path.dirname(TOKEN_CACHE_FILE), { recursive: true });
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Token cache only reduces API calls; failures should not block quotes.
  }
}

function canUseRemoteTokenCache() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function remoteTokenHeaders(prefer = '') {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function loadRemoteTokenCache() {
  if (!canUseRemoteTokenCache()) return null;

  try {
    const url = new URL('/rest/v1/api_token_cache', SUPABASE_URL);
    url.searchParams.set('provider', `eq.${REMOTE_TOKEN_PROVIDER}`);
    url.searchParams.set('select', 'access_token,expires_at');
    url.searchParams.set('limit', '1');

    const res = await fetch(url, { headers: remoteTokenHeaders() });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

    const [row] = await res.json();
    const expiresAt = row?.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (row?.access_token && expiresAt > Date.now() + 60_000) {
      tokenCache = {
        accessToken: row.access_token,
        expiresAt,
      };
      saveTokenCache(tokenCache);
      return tokenCache;
    }
  } catch (err) {
    console.warn(`[KIS] remote token cache 조회 실패: ${err.message}`);
  }

  return null;
}

async function saveRemoteTokenCache(cache) {
  if (!canUseRemoteTokenCache() || !cache?.accessToken || !cache?.expiresAt) return;

  try {
    const url = new URL('/rest/v1/api_token_cache', SUPABASE_URL);
    url.searchParams.set('on_conflict', 'provider');
    const payload = [{
      provider: REMOTE_TOKEN_PROVIDER,
      access_token: cache.accessToken,
      expires_at: new Date(cache.expiresAt).toISOString(),
      token_type: 'Bearer',
      updated_at: new Date().toISOString(),
    }];

    const res = await fetch(url, {
      method: 'POST',
      headers: remoteTokenHeaders('resolution=merge-duplicates'),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  } catch (err) {
    console.warn(`[KIS] remote token cache 저장 실패: ${err.message}`);
  }
}

async function throttleKisRequest() {
  const minIntervalMs = Number(process.env.KIS_MIN_REQUEST_INTERVAL_MS || 1100);
  const waitMs = Math.max(0, minIntervalMs - (Date.now() - lastRequestAt));
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
}

function scheduleKisRequest(fn) {
  const run = requestQueue
    .catch(() => {})
    .then(async () => {
      await throttleKisRequest();
      return fn();
    });
  requestQueue = run.catch(() => {});
  return run;
}

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
  const cached = loadTokenCache();
  if (cached.accessToken && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }
  const remoteCached = await loadRemoteTokenCache();
  if (remoteCached?.accessToken && remoteCached.expiresAt > Date.now() + 60_000) {
    return remoteCached.accessToken;
  }
  if (process.env.KIS_ACCESS_TOKEN && !KIS_APP_KEY && !KIS_APP_SECRET) {
    return process.env.KIS_ACCESS_TOKEN;
  }
  if (!KIS_APP_KEY || !KIS_APP_SECRET) return '';
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    const res = await scheduleKisRequest(() => fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
      }),
    }));
    if (!res.ok) throw new Error(`KIS token HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    if (!data.access_token) throw new Error('KIS token missing');
    const expiresIn = Number(data.expires_in || 0);
    tokenCache = {
      accessToken: data.access_token,
      expiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : Date.now() + (23 * 60 * 60 * 1000),
    };
    saveTokenCache(tokenCache);
    await saveRemoteTokenCache(tokenCache);
    return tokenCache.accessToken;
  })();

  try {
    return await tokenPromise;
  } finally {
    tokenPromise = null;
  }
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

    const res = await scheduleKisRequest(() => fetch(url, {
      headers: getAuthHeaders(accessToken, 'FHKST01010100'),
    }));
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

    const res = await scheduleKisRequest(() => fetch(url, {
      headers: getAuthHeaders(accessToken, 'FHKST03010100'),
    }));
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
