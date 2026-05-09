function compactText(value = '', maxLength = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function formatDailySummaryContext(summaries = [], limit = 2) {
  return (summaries || []).slice(0, limit).map(summary => {
    const stats = summary.stats || {};
    const topNews = (summary.topNews || summary.top_news || [])
      .slice(0, 3)
      .map(item => compactText(item.title || item.titleKo || item.summary || '', 50))
      .filter(Boolean)
      .join(' | ');
    const stockSummary = summary.stockReport?.market_summary || summary.stock_report?.market_summary || '';
    const counts = typeof stats.total === 'number'
      ? `뉴스 ${stats.total}건, 호재 ${stats.bullish || 0}, 악재 ${stats.bearish || 0}`
      : '';
    return [
      `${summary.date || 'unknown'}: ${counts}`,
      stockSummary ? `시장평: ${compactText(stockSummary, 60)}` : '',
      topNews ? `상위뉴스: ${topNews}` : '',
    ].filter(Boolean).join(' / ');
  });
}

function formatStockReportContext(reports = [], limit = 2) {
  return (reports || []).slice(0, limit).map(report => {
    const decision = report.decision || {};
    const stocks = (report.stocks || [])
      .slice(0, 4)
      .map(stock => {
        const name = stock.name || stock.ticker || '';
        const signal = stock.signal || '';
        const action = stock.risk_review?.action || stock.riskReview?.action || '';
        return [name, signal, action].filter(Boolean).join('/');
      })
      .filter(Boolean)
      .join(', ');
    return [
      `${report.date || report.id || 'recent'}: ${compactText(report.market_summary || '', 70)}`,
      decision.market?.regime ? `레짐 ${decision.market.regime}` : '',
      stocks ? `후보 ${stocks}` : '',
    ].filter(Boolean).join(' / ');
  });
}

function buildReportContext({ dailySummaries = [], stockReports = [] } = {}) {
  const lines = [];
  const summaries = formatDailySummaryContext(dailySummaries);
  const reports = formatStockReportContext(stockReports);
  if (summaries.length > 0) {
    lines.push('Recent daily summaries:');
    lines.push(...summaries.map(line => `- ${line}`));
  }
  if (reports.length > 0) {
    lines.push('Recent stock reports:');
    lines.push(...reports.map(line => `- ${line}`));
  }
  return lines;
}

module.exports = {
  compactText,
  formatDailySummaryContext,
  formatStockReportContext,
  buildReportContext,
};
