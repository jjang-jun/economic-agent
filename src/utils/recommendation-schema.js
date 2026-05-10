function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeName(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[()㈜주식회사.,·-]/g, '')
    .toLowerCase();
}

function isNameMismatch(stockName, officialName) {
  const candidate = normalizeName(stockName);
  const official = normalizeName(officialName);
  if (!candidate || !official) return false;
  return candidate !== official && !candidate.includes(official) && !official.includes(candidate);
}

function validateRecommendationSchema(stock = {}) {
  const risk = stock.risk_profile || stock.riskProfile || {};
  const market = stock.market_profile || stock.marketProfile || {};
  const relatedNews = Array.isArray(stock.related_news)
    ? stock.related_news
    : (Array.isArray(stock.relatedNews) ? stock.relatedNews : []);
  const blockers = [];

  if (!hasText(stock.name) && !hasText(stock.ticker)) blockers.push('identity: missing');
  if (!hasText(stock.thesis)) blockers.push('thesis: missing');
  if (!hasText(stock.reason)) blockers.push('reason: missing');
  if (relatedNews.length === 0) blockers.push('evidence: missing related_news');
  if (!hasNumber(risk.entryReferencePrice)) blockers.push('entry_price: missing');
  if (!hasNumber(risk.stopLossPrice) && !hasNumber(risk.expectedLossPct)) blockers.push('stop_loss: missing');
  if (!hasNumber(risk.riskReward)) blockers.push('risk_reward: missing');
  if (!hasNumber(risk.suggestedWeightPct) && !hasNumber(risk.suggestedAmount)) blockers.push('position_size: missing');
  if (!hasText(risk.invalidation) && !hasText(stock.invalidation)) blockers.push('invalidation: missing');
  if (hasText(stock.name) && hasText(market.name) && isNameMismatch(stock.name, market.name)) {
    blockers.push(`identity_name_mismatch: recommended ${stock.name} / official ${market.name}`);
  }

  return {
    passed: blockers.length === 0,
    blockers,
  };
}

function mergeSchemaValidationIntoRiskReview(stock, validation) {
  const review = stock.risk_review || {};
  const blockers = [...(review.blockers || [])];
  for (const blocker of validation.blockers || []) {
    blockers.push(`schema_${blocker}`);
  }
  return {
    ...review,
    approved: Boolean(review.approved) && validation.passed,
    action: validation.passed ? (review.action || 'candidate') : 'watch_only',
    blockers,
  };
}

function applyRecommendationSchemaValidation(report) {
  if (!report?.stocks) return report;
  report.stocks = report.stocks.map(stock => {
    const validation = validateRecommendationSchema(stock);
    return {
      ...stock,
      schema_validation: validation,
      risk_review: mergeSchemaValidationIntoRiskReview(stock, validation),
    };
  });
  return report;
}

module.exports = {
  validateRecommendationSchema,
  applyRecommendationSchemaValidation,
  isNameMismatch,
};
