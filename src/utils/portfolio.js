const fs = require('fs');
const path = require('path');
const DEFAULT_PORTFOLIO = require('../config/portfolio');
const { fetchCurrentPrice, normalizeYahooSymbol } = require('../sources/price-provider');

const DEFAULT_PORTFOLIO_FILE = path.join(__dirname, '..', '..', 'data', 'portfolio.json');
const SNAPSHOT_DIR = path.join(__dirname, '..', '..', 'data', 'portfolio-snapshots');

function readPortfolioFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function readPortfolioEnv() {
  if (process.env.PORTFOLIO_JSON_BASE64) {
    try {
      const json = Buffer.from(process.env.PORTFOLIO_JSON_BASE64, 'base64').toString('utf-8');
      return JSON.parse(json);
    } catch (err) {
      console.warn(`[Portfolio] PORTFOLIO_JSON_BASE64 파싱 실패: ${err.message}`);
    }
  }
  if (process.env.PORTFOLIO_JSON) {
    try {
      return JSON.parse(process.env.PORTFOLIO_JSON);
    } catch (err) {
      console.warn(`[Portfolio] PORTFOLIO_JSON 파싱 실패: ${err.message}`);
    }
  }
  return null;
}

function normalizePosition(position) {
  return {
    name: position.name || '',
    ticker: position.ticker || '',
    symbol: position.symbol || normalizeYahooSymbol(position.ticker || ''),
    currency: position.currency || '',
    avgPrice: position.avgPrice ?? null,
    currentPrice: position.currentPrice ?? null,
    priceCurrency: position.priceCurrency || position.currency || '',
    priceSource: position.priceSource || '',
    quoteSource: position.quoteSource || '',
    marketTime: position.marketTime || null,
    quantity: position.quantity ?? null,
    sector: position.sector || '',
    weight: position.weight ?? position.ratio ?? null,
    thesis: position.thesis || '',
    stopLossPct: position.stopLossPct ?? null,
    manualPnlPct: position.manualPnlPct ?? null,
    previousClose: position.previousClose ?? null,
    changePercent: position.changePercent ?? null,
    return5dPct: position.return5dPct ?? null,
    return20dPct: position.return20dPct ?? null,
    fxRate: position.fxRate ?? null,
    costBasis: position.costBasis ?? null,
    marketValue: position.marketValue ?? null,
    unrealizedPnl: position.unrealizedPnl ?? null,
    unrealizedPnlPct: position.unrealizedPnlPct ?? null,
  };
}

function normalizePortfolio(raw) {
  const merged = {
    ...DEFAULT_PORTFOLIO,
    ...(raw || {}),
  };
  const positions = (merged.positions || [])
    .filter(position => position && (position.name || position.ticker))
    .map(normalizePosition);

  const totalAssetValue = merged.totalAssetValue ?? null;
  const cashAmount = merged.cashAmount ?? null;
  const cashRatio = totalAssetValue && cashAmount !== null
    ? cashAmount / totalAssetValue
    : merged.cashRatio;

  return {
    ...merged,
    cashRatio,
    cashAmount,
    totalAssetValue,
    positions,
  };
}

function loadPortfolio() {
  const filePath = process.env.PORTFOLIO_FILE || DEFAULT_PORTFOLIO_FILE;
  const local = readPortfolioEnv() || readPortfolioFile(filePath);
  return normalizePortfolio(local);
}

function savePortfolioFile(portfolio, filePath = process.env.PORTFOLIO_FILE || DEFAULT_PORTFOLIO_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(portfolio, null, 2));
  return filePath;
}

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getFxRate(currency, fxRates = {}, fallbackFxRate = null) {
  if (!currency || currency === 'KRW') return 1;
  if (currency === 'USD') {
    if (typeof fxRates.USDKRW === 'number' && Number.isFinite(fxRates.USDKRW) && fxRates.USDKRW > 1) {
      return fxRates.USDKRW;
    }
    if (typeof fallbackFxRate === 'number' && Number.isFinite(fallbackFxRate) && fallbackFxRate > 1) {
      return fallbackFxRate;
    }
    return null;
  }
  return 1;
}

function valuePosition(position, quote, fxRates = {}) {
  const quantity = typeof position.quantity === 'number' ? position.quantity : null;
  const avgPrice = typeof position.avgPrice === 'number' ? position.avgPrice : null;
  const manualPnlPct = typeof position.manualPnlPct === 'number'
    ? position.manualPnlPct
    : null;
  const manualUnrealizedPnl = typeof position.unrealizedPnl === 'number'
    ? position.unrealizedPnl
    : null;
  const manualCurrentPrice = manualPnlPct !== null && avgPrice !== null
    ? avgPrice * (1 + manualPnlPct / 100)
    : null;
  const existingCostBasis = typeof position.costBasis === 'number' ? position.costBasis : null;
  const existingMarketValue = typeof position.marketValue === 'number' ? position.marketValue : null;
  const existingPnlPct = typeof position.unrealizedPnlPct === 'number' ? position.unrealizedPnlPct : null;
  const currentPrice = typeof position.currentPrice === 'number'
    ? position.currentPrice
    : (manualCurrentPrice ?? quote?.price ?? null);
  const currency = position.currency || quote?.currency || '';
  const fxRate = getFxRate(currency, fxRates, position.fxRate);
  const canValue = typeof fxRate === 'number' && Number.isFinite(fxRate);
  const hasQuotePrice = typeof quote?.price === 'number' && Number.isFinite(quote.price);
  const preserveManualValuation = existingMarketValue !== null && (
    position.priceSource === 'manual'
    || position.quoteSource === 'manual'
    || typeof position.currentPrice === 'number'
  );
  const costBasis = existingCostBasis !== null && (!hasQuotePrice || preserveManualValuation)
    ? existingCostBasis
    : (canValue && quantity !== null && avgPrice !== null ? quantity * avgPrice * fxRate : existingCostBasis);
  const marketValue = existingMarketValue !== null && (!hasQuotePrice || preserveManualValuation)
    ? existingMarketValue
    : (canValue && quantity !== null && typeof currentPrice === 'number' ? quantity * currentPrice * fxRate : existingMarketValue);
  const unrealizedPnl = manualUnrealizedPnl !== null
    ? manualUnrealizedPnl
    : (marketValue !== null && costBasis !== null ? marketValue - costBasis : null);
  const unrealizedPnlPct = manualPnlPct !== null
    ? manualPnlPct
    : (existingPnlPct !== null && (!hasQuotePrice || preserveManualValuation)
    ? existingPnlPct
    : (unrealizedPnl !== null && costBasis
    ? round((unrealizedPnl / costBasis) * 100)
    : existingPnlPct));

  return {
    ...position,
    currentPrice,
    priceCurrency: quote?.currency || currency,
    priceSource: typeof position.currentPrice === 'number' || manualPnlPct !== null ? 'manual' : (quote?.source ? 'quote' : position.priceSource),
    quoteSource: typeof position.currentPrice === 'number' || manualPnlPct !== null ? 'manual' : (quote?.source || position.quoteSource || ''),
    fxRate: fxRate ?? position.fxRate ?? null,
    previousClose: quote?.previousClose ?? position.previousClose ?? null,
    changePercent: quote?.changePercent ?? position.changePercent ?? null,
    return5dPct: quote?.return5dPct ?? position.return5dPct ?? null,
    return20dPct: quote?.return20dPct ?? position.return20dPct ?? null,
    currency,
    marketTime: typeof position.currentPrice === 'number' ? position.marketTime ?? null : (quote?.marketTime || position.marketTime || null),
    costBasis,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPct,
    manualPnlPct,
  };
}

async function enrichPortfolio(portfolio = loadPortfolio(), options = {}) {
  const fetcher = options.fetcher || fetchCurrentPrice;
  const usdKrw = await fetcher('KRW=X');
  const fxRates = {
    USDKRW: typeof usdKrw?.price === 'number' ? usdKrw.price : null,
  };
  const valuedPositions = await Promise.all((portfolio.positions || []).map(async position => {
    const quote = position.symbol || position.ticker
      ? await fetcher(position.symbol || position.ticker)
      : null;
    return valuePosition(position, quote, fxRates);
  }));

  const investedAmount = valuedPositions.reduce((sum, position) => (
    sum + (typeof position.marketValue === 'number' ? position.marketValue : 0)
  ), 0);
  const costBasis = valuedPositions.reduce((sum, position) => (
    sum + (typeof position.costBasis === 'number' ? position.costBasis : 0)
  ), 0);
  const cashAmount = typeof portfolio.cashAmount === 'number' ? portfolio.cashAmount : 0;
  const hasFreshValuation = valuedPositions.some(position => position.priceSource === 'quote');
  const totalAssetValue = hasFreshValuation || typeof portfolio.totalAssetValue !== 'number'
    ? cashAmount + investedAmount
    : portfolio.totalAssetValue;
  const unrealizedPnl = valuedPositions.reduce((sum, position) => (
    sum + (typeof position.unrealizedPnl === 'number' ? position.unrealizedPnl : 0)
  ), 0);
  const positions = valuedPositions.map(position => ({
    ...position,
    weight: totalAssetValue && typeof position.marketValue === 'number'
      ? position.marketValue / totalAssetValue
      : position.weight,
  }));

  return {
    ...portfolio,
    positions,
    cashAmount,
    investedAmount: hasFreshValuation || typeof portfolio.investedAmount !== 'number' ? investedAmount : portfolio.investedAmount,
    totalAssetValue: totalAssetValue || portfolio.totalAssetValue,
    cashRatio: totalAssetValue ? cashAmount / totalAssetValue : portfolio.cashRatio,
    costBasis,
    unrealizedPnl: hasFreshValuation || typeof portfolio.unrealizedPnl !== 'number' ? unrealizedPnl : portfolio.unrealizedPnl,
    unrealizedPnlPct: hasFreshValuation || typeof portfolio.unrealizedPnlPct !== 'number'
      ? (costBasis ? round((unrealizedPnl / costBasis) * 100) : null)
      : portfolio.unrealizedPnlPct,
    fxRates,
    capturedAt: new Date().toISOString(),
  };
}

function getKSTDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function savePortfolioSnapshot(snapshot, date = getKSTDate()) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const file = path.join(SNAPSHOT_DIR, `${date}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
  return file;
}

function loadLatestPortfolioSnapshot() {
  try {
    const files = fs.readdirSync(SNAPSHOT_DIR)
      .filter(file => file.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    return JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, files[0]), 'utf-8'));
  } catch {
    return null;
  }
}

function applyTradeToPortfolio(rawPortfolio, trade) {
  const portfolio = normalizePortfolio(rawPortfolio);
  const amount = typeof trade.amount === 'number'
    ? trade.amount
    : trade.quantity * trade.price;
  const positions = [...portfolio.positions];
  const symbol = trade.symbol || normalizeYahooSymbol(trade.ticker || '');
  const index = positions.findIndex(position => (
    (symbol && position.symbol === symbol)
    || (trade.ticker && position.ticker === trade.ticker)
  ));

  if (trade.side === 'buy') {
    const existing = index >= 0 ? positions[index] : null;
    if (existing) {
      const oldQty = Number(existing.quantity || 0);
      const oldAvg = Number(existing.avgPrice || 0);
      const newQty = oldQty + trade.quantity;
      const newAvg = newQty > 0
        ? ((oldQty * oldAvg) + (trade.quantity * trade.price)) / newQty
        : trade.price;
      positions[index] = {
        ...existing,
        name: existing.name || trade.name || '',
        ticker: existing.ticker || trade.ticker || '',
        symbol: existing.symbol || symbol,
        quantity: newQty,
        avgPrice: Math.round(newAvg * 100) / 100,
      };
    } else {
      positions.push(normalizePosition({
        name: trade.name || '',
        ticker: trade.ticker || '',
        symbol,
        quantity: trade.quantity,
        avgPrice: trade.price,
      }));
    }
    portfolio.cashAmount = typeof portfolio.cashAmount === 'number'
      ? portfolio.cashAmount - amount
      : portfolio.cashAmount;
  } else if (trade.side === 'sell') {
    if (index < 0) throw new Error(`position not found for ${trade.ticker || trade.symbol}`);
    const existing = positions[index];
    const remaining = Number(existing.quantity || 0) - trade.quantity;
    if (remaining < -1e-9) throw new Error(`sell quantity exceeds position for ${trade.ticker || trade.symbol}`);
    if (remaining <= 1e-9) {
      positions.splice(index, 1);
    } else {
      positions[index] = { ...existing, quantity: remaining };
    }
    portfolio.cashAmount = typeof portfolio.cashAmount === 'number'
      ? portfolio.cashAmount + amount
      : portfolio.cashAmount;
  }

  portfolio.positions = positions;
  portfolio.totalAssetValue = typeof portfolio.totalAssetValue === 'number'
    ? portfolio.totalAssetValue
    : portfolio.cashAmount;
  portfolio.cashRatio = portfolio.totalAssetValue && typeof portfolio.cashAmount === 'number'
    ? portfolio.cashAmount / portfolio.totalAssetValue
    : portfolio.cashRatio;
  return portfolio;
}

module.exports = {
  loadPortfolio,
  normalizePortfolio,
  savePortfolioFile,
  applyTradeToPortfolio,
  enrichPortfolio,
  savePortfolioSnapshot,
  loadLatestPortfolioSnapshot,
  DEFAULT_PORTFOLIO_FILE,
  SNAPSHOT_DIR,
};
