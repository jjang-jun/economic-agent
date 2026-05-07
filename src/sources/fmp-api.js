const FMP_BASE_URL = process.env.FMP_BASE_URL || 'https://financialmodelingprep.com/stable';
const FMP_API_KEY = process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || '';

function isFmpConfigured() {
  return Boolean(FMP_API_KEY);
}

function normalizeFmpSymbol(symbol) {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw || raw.includes('=') || raw.startsWith('^') || /^\d{6}(\.(KS|KQ))?$/.test(raw)) return '';
  const cleaned = raw.replace(/[^A-Z0-9.-]/g, '');
  if (!cleaned) return '';
  return cleaned;
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const num = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function round(value, digits = 4) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildFmpUrl(endpoint) {
  const base = FMP_BASE_URL.endsWith('/') ? FMP_BASE_URL : `${FMP_BASE_URL}/`;
  return new URL(String(endpoint || '').replace(/^\//, ''), base);
}

async function fetchFmpQuote(symbol) {
  const ticker = normalizeFmpSymbol(symbol);
  if (!ticker || !isFmpConfigured()) return null;

  try {
    const url = buildFmpUrl('quote');
    url.searchParams.set('symbol', ticker);
    url.searchParams.set('apikey', FMP_API_KEY);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('no quote');

    const price = parseNumber(row.price);
    if (typeof price !== 'number') throw new Error('no price');

    const previousClose = parseNumber(row.previousClose);
    const changePercent = parseNumber(row.changesPercentage);
    const marketTime = row.timestamp
      ? new Date(Number(row.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    return {
      symbol: row.symbol || ticker,
      ticker,
      name: row.name || '',
      price,
      previousClose,
      changePercent,
      volume: parseNumber(row.volume),
      currency: row.currency || 'USD',
      market: 'US',
      exchange: row.exchange || row.exchangeShortName || '',
      priceType: 'current',
      isRealtime: true,
      isAdjusted: false,
      marketTime,
      source: 'fmp',
      raw: row,
    };
  } catch (err) {
    console.warn(`[FMP] ${ticker} 가격 조회 실패: ${err.message}`);
    return null;
  }
}

function rowToFmpEodQuote(row, symbol) {
  const ticker = normalizeFmpSymbol(symbol || row.symbol || '');
  const price = parseNumber(row.adjClose ?? row.close);
  if (!ticker || typeof price !== 'number') return null;

  return {
    symbol: ticker,
    ticker,
    name: '',
    price,
    open: parseNumber(row.open),
    high: parseNumber(row.high),
    low: parseNumber(row.low),
    close: parseNumber(row.close) ?? price,
    adjustedClose: parseNumber(row.adjClose),
    previousClose: null,
    changePercent: parseNumber(row.changePercent),
    volume: parseNumber(row.volume),
    currency: 'USD',
    market: 'US',
    exchange: '',
    priceType: 'eod',
    isRealtime: false,
    isAdjusted: Boolean(row.adjClose),
    marketTime: row.date ? `${row.date}T20:00:00-04:00` : new Date().toISOString(),
    source: 'fmp-eod',
    raw: row,
  };
}

async function fetchFmpDailyOhlcv(symbol, from, to) {
  const ticker = normalizeFmpSymbol(symbol);
  if (!ticker || !isFmpConfigured()) return [];

  try {
    const url = buildFmpUrl('historical-price-eod/full');
    url.searchParams.set('symbol', ticker);
    if (from) url.searchParams.set('from', String(from).slice(0, 10));
    if (to) url.searchParams.set('to', String(to).slice(0, 10));
    url.searchParams.set('apikey', FMP_API_KEY);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data.historical || data.data || []);
    return rows
      .map(row => rowToFmpEodQuote(row, ticker))
      .filter(Boolean)
      .sort((a, b) => new Date(a.marketTime) - new Date(b.marketTime));
  } catch (err) {
    console.warn(`[FMP] ${ticker} EOD 조회 실패: ${err.message}`);
    return [];
  }
}

async function fetchFmpProfile(symbol) {
  const ticker = normalizeFmpSymbol(symbol);
  if (!ticker || !isFmpConfigured()) return null;

  try {
    const url = buildFmpUrl('profile');
    url.searchParams.set('symbol', ticker);
    url.searchParams.set('apikey', FMP_API_KEY);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    return Array.isArray(data) ? data[0] || null : data;
  } catch (err) {
    console.warn(`[FMP] ${ticker} profile 조회 실패: ${err.message}`);
    return null;
  }
}

async function fetchFmpStatement(endpoint, symbol, options = {}) {
  const ticker = normalizeFmpSymbol(symbol);
  if (!ticker || !isFmpConfigured()) return [];

  try {
    const url = buildFmpUrl(endpoint);
    url.searchParams.set('symbol', ticker);
    url.searchParams.set('period', options.period || 'annual');
    url.searchParams.set('limit', String(options.limit || 4));
    url.searchParams.set('apikey', FMP_API_KEY);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`[FMP] ${ticker} ${endpoint} 조회 실패: ${err.message}`);
    return [];
  }
}

function calculateGrowthPct(current, previous) {
  const left = parseNumber(current);
  const right = parseNumber(previous);
  if (typeof left !== 'number' || typeof right !== 'number' || right === 0) return null;
  return round(((left - right) / Math.abs(right)) * 100, 2);
}

function buildFmpFundamentalSummary({ income = [], cashFlow = [], ratios = [] } = {}) {
  const latestIncome = income[0] || {};
  const previousIncome = income[1] || {};
  const latestCashFlow = cashFlow[0] || {};
  const latestRatios = ratios[0] || {};
  const revenue = parseNumber(latestIncome.revenue);
  const netIncome = parseNumber(latestIncome.netIncome);
  const freeCashFlow = parseNumber(
    latestCashFlow.freeCashFlow
      ?? (
        parseNumber(latestCashFlow.operatingCashFlow) !== null && parseNumber(latestCashFlow.capitalExpenditure) !== null
          ? parseNumber(latestCashFlow.operatingCashFlow) - Math.abs(parseNumber(latestCashFlow.capitalExpenditure))
          : null
      )
  );

  return {
    fiscalDate: latestIncome.date || latestCashFlow.date || latestRatios.date || '',
    fiscalYear: latestIncome.fiscalYear || latestCashFlow.fiscalYear || latestRatios.fiscalYear || '',
    revenue,
    revenueGrowthYoYPct: calculateGrowthPct(revenue, previousIncome.revenue),
    netIncome,
    netIncomeGrowthYoYPct: calculateGrowthPct(netIncome, previousIncome.netIncome),
    freeCashFlow,
    freeCashFlowMarginPct: revenue && typeof freeCashFlow === 'number'
      ? round((freeCashFlow / revenue) * 100, 2)
      : null,
    grossProfitMarginPct: typeof latestRatios.grossProfitMargin === 'number' ? round(latestRatios.grossProfitMargin * 100, 2) : null,
    operatingProfitMarginPct: typeof latestRatios.operatingProfitMargin === 'number' ? round(latestRatios.operatingProfitMargin * 100, 2) : null,
    debtToEquity: parseNumber(latestRatios.debtToEquityRatio ?? latestRatios.debtEquityRatio),
    currentRatio: parseNumber(latestRatios.currentRatio),
    peRatio: parseNumber(latestRatios.priceToEarningsRatio ?? latestRatios.peRatio),
    source: 'fmp-statements',
  };
}

async function fetchFmpFundamentalSummary(symbol, options = {}) {
  const ticker = normalizeFmpSymbol(symbol);
  if (!ticker || !isFmpConfigured()) return null;
  const requestOptions = { period: options.period || 'annual', limit: options.limit || 4 };
  const [income, cashFlow, ratios] = await Promise.all([
    fetchFmpStatement('income-statement', ticker, requestOptions),
    fetchFmpStatement('cash-flow-statement', ticker, requestOptions),
    fetchFmpStatement('ratios', ticker, requestOptions),
  ]);
  if (income.length === 0 && cashFlow.length === 0 && ratios.length === 0) return null;
  return buildFmpFundamentalSummary({ income, cashFlow, ratios });
}

function dateDiffDays(from, to) {
  const left = new Date(`${String(from).slice(0, 10)}T00:00:00Z`);
  const right = new Date(`${String(to).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return null;
  return Math.round((right.getTime() - left.getTime()) / 86400000);
}

function buildFmpEarningsSummary(rows = [], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const sorted = [...rows]
    .filter(row => row?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const next = sorted.find(row => String(row.date).slice(0, 10) >= today) || null;
  const previous = [...sorted].reverse().find(row => (
    String(row.date).slice(0, 10) < today && row.epsActual !== null && row.epsActual !== undefined
  )) || null;
  const epsActual = parseNumber(previous?.epsActual);
  const epsEstimated = parseNumber(previous?.epsEstimated);
  const epsSurprisePct = typeof epsActual === 'number' && typeof epsEstimated === 'number' && epsEstimated !== 0
    ? round(((epsActual - epsEstimated) / Math.abs(epsEstimated)) * 100, 2)
    : null;

  return {
    nextDate: next?.date || '',
    daysUntilNext: next?.date ? dateDiffDays(today, next.date) : null,
    nextEpsEstimated: parseNumber(next?.epsEstimated),
    nextRevenueEstimated: parseNumber(next?.revenueEstimated),
    previousDate: previous?.date || '',
    previousEpsActual: epsActual,
    previousEpsEstimated: epsEstimated,
    previousEpsSurprisePct: epsSurprisePct,
    previousRevenueActual: parseNumber(previous?.revenueActual),
    previousRevenueEstimated: parseNumber(previous?.revenueEstimated),
    source: 'fmp-earnings',
  };
}

async function fetchFmpEarningsSummary(symbol, options = {}) {
  const ticker = normalizeFmpSymbol(symbol);
  if (!ticker || !isFmpConfigured()) return null;

  try {
    const url = buildFmpUrl('earnings');
    url.searchParams.set('symbol', ticker);
    url.searchParams.set('apikey', FMP_API_KEY);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return null;
    return buildFmpEarningsSummary(rows, options.now || new Date());
  } catch (err) {
    console.warn(`[FMP] ${ticker} earnings 조회 실패: ${err.message}`);
    return null;
  }
}

module.exports = {
  isFmpConfigured,
  normalizeFmpSymbol,
  fetchFmpQuote,
  rowToFmpEodQuote,
  fetchFmpDailyOhlcv,
  fetchFmpProfile,
  fetchFmpStatement,
  buildFmpFundamentalSummary,
  fetchFmpFundamentalSummary,
  dateDiffDays,
  buildFmpEarningsSummary,
  fetchFmpEarningsSummary,
};
