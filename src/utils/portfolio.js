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
  DEFAULT_PORTFOLIO_FILE,
  SNAPSHOT_DIR,
};
