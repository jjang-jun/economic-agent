const fs = require('fs');
const path = require('path');
const DEFAULT_PORTFOLIO = require('../config/portfolio');
const { fetchQuote, normalizeYahooSymbol } = require('../sources/yahoo-finance');

const DEFAULT_PORTFOLIO_FILE = path.join(__dirname, '..', '..', 'data', 'portfolio.json');
const SNAPSHOT_DIR = path.join(__dirname, '..', '..', 'data', 'portfolio-snapshots');

function readPortfolioFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function normalizePosition(position) {
  return {
    name: position.name || '',
    ticker: position.ticker || '',
    symbol: position.symbol || normalizeYahooSymbol(position.ticker || ''),
    avgPrice: position.avgPrice ?? null,
    quantity: position.quantity ?? null,
    sector: position.sector || '',
    weight: position.weight ?? position.ratio ?? null,
    thesis: position.thesis || '',
    stopLossPct: position.stopLossPct ?? null,
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
  const local = readPortfolioFile(filePath);
  return normalizePortfolio(local);
}

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function valuePosition(position, quote) {
  const quantity = typeof position.quantity === 'number' ? position.quantity : null;
  const avgPrice = typeof position.avgPrice === 'number' ? position.avgPrice : null;
  const currentPrice = quote?.price ?? null;
  const costBasis = quantity !== null && avgPrice !== null ? quantity * avgPrice : null;
  const marketValue = quantity !== null && typeof currentPrice === 'number' ? quantity * currentPrice : null;
  const unrealizedPnl = marketValue !== null && costBasis !== null ? marketValue - costBasis : null;
  const unrealizedPnlPct = unrealizedPnl !== null && costBasis
    ? round((unrealizedPnl / costBasis) * 100)
    : null;

  return {
    ...position,
    currentPrice,
    previousClose: quote?.previousClose ?? null,
    changePercent: quote?.changePercent ?? null,
    return5dPct: quote?.return5dPct ?? null,
    return20dPct: quote?.return20dPct ?? null,
    currency: quote?.currency || '',
    marketTime: quote?.marketTime || null,
    costBasis,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPct,
  };
}

async function enrichPortfolio(portfolio = loadPortfolio()) {
  const valuedPositions = await Promise.all((portfolio.positions || []).map(async position => {
    const quote = position.symbol || position.ticker
      ? await fetchQuote(position.symbol || position.ticker)
      : null;
    return valuePosition(position, quote);
  }));

  const investedAmount = valuedPositions.reduce((sum, position) => (
    sum + (typeof position.marketValue === 'number' ? position.marketValue : 0)
  ), 0);
  const costBasis = valuedPositions.reduce((sum, position) => (
    sum + (typeof position.costBasis === 'number' ? position.costBasis : 0)
  ), 0);
  const cashAmount = typeof portfolio.cashAmount === 'number' ? portfolio.cashAmount : 0;
  const totalAssetValue = cashAmount + investedAmount;
  const unrealizedPnl = investedAmount - costBasis;
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
    investedAmount,
    totalAssetValue: totalAssetValue || portfolio.totalAssetValue,
    cashRatio: totalAssetValue ? cashAmount / totalAssetValue : portfolio.cashRatio,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPct: costBasis ? round((unrealizedPnl / costBasis) * 100) : null,
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

module.exports = {
  loadPortfolio,
  normalizePortfolio,
  enrichPortfolio,
  savePortfolioSnapshot,
  DEFAULT_PORTFOLIO_FILE,
  SNAPSHOT_DIR,
};
