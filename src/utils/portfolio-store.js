const { normalizePortfolio, applyTradeToPortfolio } = require('./portfolio');
const {
  isPersistenceEnabled,
  selectRows,
  upsertRows,
  deleteRows,
} = require('./persistence');

const DEFAULT_ACCOUNT_ID = 'default:main';
const DEFAULT_USER_KEY = 'default';

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function positionId(accountId, position) {
  return `${accountId}:${position.ticker || position.symbol || position.name}`;
}

function accountRowFromPortfolio(portfolio, accountId = DEFAULT_ACCOUNT_ID) {
  return {
    id: accountId,
    user_key: DEFAULT_USER_KEY,
    name: portfolio.name || 'Main Portfolio',
    currency: portfolio.currency || 'KRW',
    cash_amount: portfolio.cashAmount ?? null,
    total_asset_value: portfolio.totalAssetValue ?? null,
    is_default: true,
    payload: portfolio,
    updated_at: new Date().toISOString(),
  };
}

function positionRowFromPosition(position, accountId = DEFAULT_ACCOUNT_ID) {
  return {
    id: positionId(accountId, position),
    account_id: accountId,
    ticker: position.ticker || '',
    symbol: position.symbol || '',
    name: position.name || '',
    sector: position.sector || '',
    quantity: position.quantity ?? null,
    avg_price: position.avgPrice ?? null,
    current_price: position.currentPrice ?? null,
    market_value: position.marketValue ?? null,
    weight: position.weight ?? null,
    payload: position,
    updated_at: new Date().toISOString(),
  };
}

function portfolioFromRows(account, positions) {
  if (!account) return null;
  return normalizePortfolio({
    ...(account.payload || {}),
    cashAmount: toNumber(account.cash_amount),
    totalAssetValue: toNumber(account.total_asset_value),
    positions: (positions || []).map(row => ({
      ...(row.payload || {}),
      ticker: row.ticker || row.payload?.ticker || '',
      symbol: row.symbol || row.payload?.symbol || '',
      name: row.name || row.payload?.name || '',
      sector: row.sector || row.payload?.sector || '',
      quantity: toNumber(row.quantity),
      avgPrice: toNumber(row.avg_price),
      currentPrice: toNumber(row.current_price),
      marketValue: toNumber(row.market_value),
      weight: toNumber(row.weight),
    })),
  });
}

async function loadStoredPortfolio(accountId = DEFAULT_ACCOUNT_ID) {
  if (!isPersistenceEnabled()) return null;
  const accounts = await selectRows('portfolio_accounts', {
    select: '*',
    id: `eq.${accountId}`,
    limit: '1',
  });
  const account = accounts.rows?.[0];
  if (!account) return null;

  const positions = await selectRows('positions', {
    select: '*',
    account_id: `eq.${accountId}`,
    order: 'weight.desc.nullslast,market_value.desc.nullslast',
  });

  return portfolioFromRows(account, positions.rows || []);
}

async function saveStoredPortfolio(portfolio, accountId = DEFAULT_ACCOUNT_ID) {
  if (!isPersistenceEnabled()) return { saved: 0, disabled: true };
  const normalized = normalizePortfolio(portfolio);
  const accountRow = accountRowFromPortfolio(normalized, accountId);
  const positionRows = (normalized.positions || []).map(position => positionRowFromPosition(position, accountId));

  const accountResult = await upsertRows('portfolio_accounts', [accountRow], 'id');
  if (accountResult.error) throw accountResult.error;
  const deleteResult = await deleteRows('positions', { account_id: `eq.${accountId}` });
  if (deleteResult.error) throw deleteResult.error;
  if (positionRows.length > 0) {
    const positionResult = await upsertRows('positions', positionRows, 'id');
    if (positionResult.error) throw positionResult.error;
  }
  return { saved: 1, positions: positionRows.length };
}

async function updateStoredCash(cashAmount, accountId = DEFAULT_ACCOUNT_ID) {
  const portfolio = await loadStoredPortfolio(accountId);
  if (!portfolio) return null;
  const previousCash = typeof portfolio.cashAmount === 'number' ? portfolio.cashAmount : 0;
  portfolio.cashAmount = cashAmount;
  portfolio.totalAssetValue = typeof portfolio.totalAssetValue === 'number'
    ? portfolio.totalAssetValue - previousCash + cashAmount
    : portfolio.totalAssetValue;
  portfolio.cashRatio = portfolio.totalAssetValue ? cashAmount / portfolio.totalAssetValue : portfolio.cashRatio;
  await saveStoredPortfolio(portfolio, accountId);
  return portfolio;
}

async function applyTradeToStoredPortfolio(trade, accountId = DEFAULT_ACCOUNT_ID) {
  const portfolio = await loadStoredPortfolio(accountId);
  if (!portfolio) return null;
  const updated = applyTradeToPortfolio(portfolio, trade);
  await saveStoredPortfolio(updated, accountId);
  return updated;
}

module.exports = {
  DEFAULT_ACCOUNT_ID,
  loadStoredPortfolio,
  saveStoredPortfolio,
  updateStoredCash,
  applyTradeToStoredPortfolio,
};
