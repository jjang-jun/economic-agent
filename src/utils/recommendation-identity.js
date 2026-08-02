const watchlist = require('../config/watchlist');

function normalizeCompanyName(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[()㈜주식회사.,·-]/g, '')
    .toLowerCase();
}

function normalizeDomesticTicker(value) {
  const match = String(value || '').trim().match(/^(\d{6})(?:\.(?:KS|KQ))?$/i);
  return match ? match[1] : '';
}

function areCompanyNamesCompatible(left, right) {
  const a = normalizeCompanyName(left);
  const b = normalizeCompanyName(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function instrumentFromWatchItem(item = {}) {
  const ticker = normalizeDomesticTicker(item.symbol || item.ticker);
  if (!ticker || !item.name) return null;
  return { ticker, name: item.name, source: 'watchlist' };
}

function knownWatchlistInstruments() {
  const byTicker = new Map();
  for (const items of Object.values(watchlist)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const instrument = instrumentFromWatchItem(item);
      if (instrument) byTicker.set(instrument.ticker, instrument);
    }
  }
  return [...byTicker.values()];
}

function relatedArticleIds(stock = {}) {
  return new Set(
    (stock.related_article_ids || stock.relatedArticleIds || []).filter(Boolean),
  );
}

function disclosureInstruments(stock, articles = []) {
  const ids = relatedArticleIds(stock);
  if (ids.size === 0) return [];
  const byTicker = new Map();
  for (const article of articles) {
    if (!ids.has(article?.id)) continue;
    const ticker = normalizeDomesticTicker(article?.disclosure?.stockCode);
    const name = String(article?.disclosure?.corpName || '').trim();
    if (!ticker || !name) continue;
    byTicker.set(ticker, {
      ticker,
      name,
      source: 'dart_disclosure',
      articleId: article.id,
      corpCode: article.disclosure.corpCode || '',
    });
  }
  return [...byTicker.values()];
}

function selectInstrument(stock, instruments) {
  const name = normalizeCompanyName(stock.name);
  const ticker = normalizeDomesticTicker(stock.ticker || stock.symbol);
  const nameMatches = instruments.filter(item => normalizeCompanyName(item.name) === name);
  const tickerMatches = instruments.filter(item => item.ticker === ticker);

  if (nameMatches.length === 1 && tickerMatches.length === 1
    && nameMatches[0].ticker !== tickerMatches[0].ticker) {
    return { status: 'conflict', reason: 'name_ticker_evidence_conflict' };
  }
  if (nameMatches.length === 1) return { status: 'verified', instrument: nameMatches[0] };
  if (tickerMatches.length === 1) return { status: 'verified', instrument: tickerMatches[0] };
  if (nameMatches.length > 1 || tickerMatches.length > 1) {
    return { status: 'conflict', reason: 'ambiguous_identity_evidence' };
  }
  return { status: 'unverified', reason: 'no_matching_identity_evidence' };
}

function applyResolvedInstrument(stock, selected) {
  if (selected.status !== 'verified') {
    return {
      ...stock,
      identity_resolution: {
        status: selected.status,
        reason: selected.reason,
        originalName: stock.name || '',
        originalTicker: stock.ticker || stock.symbol || '',
      },
    };
  }

  const { instrument } = selected;
  const originalName = stock.name || '';
  const originalTicker = stock.ticker || stock.symbol || '';
  const correctedFields = [];
  if (normalizeCompanyName(originalName) !== normalizeCompanyName(instrument.name)) correctedFields.push('name');
  if (normalizeDomesticTicker(originalTicker) !== instrument.ticker) correctedFields.push('ticker');
  return {
    ...stock,
    name: instrument.name,
    ticker: instrument.ticker,
    identity_resolution: {
      status: 'verified',
      source: instrument.source,
      evidenceArticleId: instrument.articleId || '',
      corpCode: instrument.corpCode || '',
      originalName,
      originalTicker,
      resolvedName: instrument.name,
      resolvedTicker: instrument.ticker,
      correctedFields,
    },
  };
}

function resolveRecommendationIdentity(stock = {}, articles = []) {
  const disclosureEvidence = disclosureInstruments(stock, articles);
  if (disclosureEvidence.length > 0) {
    return applyResolvedInstrument(stock, selectInstrument(stock, disclosureEvidence));
  }
  return applyResolvedInstrument(stock, selectInstrument(stock, knownWatchlistInstruments()));
}

function verifyIdentityFromMarketProfile(stock = {}, marketProfile = {}) {
  const existing = stock.identity_resolution || stock.identityResolution || {};
  if (!marketProfile.name) return stock;
  if (!areCompanyNamesCompatible(stock.name, marketProfile.name)) {
    return {
      ...stock,
      identity_resolution: {
        ...existing,
        status: 'conflict',
        reason: 'official_quote_name_mismatch',
        quoteName: marketProfile.name,
        quoteSource: marketProfile.source || '',
      },
    };
  }
  if (existing.status === 'verified') return stock;
  return {
    ...stock,
    identity_resolution: {
      ...existing,
      status: 'verified',
      source: 'official_quote_name',
      quoteName: marketProfile.name,
      quoteSource: marketProfile.source || '',
      resolvedName: stock.name || marketProfile.name,
      resolvedTicker: normalizeDomesticTicker(stock.ticker || stock.symbol),
    },
  };
}

function applyRecommendationIdentities(report, articles = []) {
  if (!Array.isArray(report?.stocks)) return report;
  report.stocks = report.stocks.map(stock => resolveRecommendationIdentity(stock, articles));
  return report;
}

module.exports = {
  normalizeCompanyName,
  normalizeDomesticTicker,
  areCompanyNamesCompatible,
  knownWatchlistInstruments,
  disclosureInstruments,
  resolveRecommendationIdentity,
  verifyIdentityFromMarketProfile,
  applyRecommendationIdentities,
};
