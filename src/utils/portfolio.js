const fs = require('fs');
const path = require('path');
const DEFAULT_PORTFOLIO = require('../config/portfolio');

const DEFAULT_PORTFOLIO_FILE = path.join(__dirname, '..', '..', 'data', 'portfolio.json');

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

module.exports = {
  loadPortfolio,
  normalizePortfolio,
  DEFAULT_PORTFOLIO_FILE,
};
