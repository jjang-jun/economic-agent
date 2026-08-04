const { loadTradeExecutionsWithStatus } = require('../utils/trade-log');
const { buildTradePerformanceReport } = require('../utils/trade-performance');
const { formatKRW } = require('../utils/decision-engine');
const { escapeHtml } = require('./response-composer');

function tradeTime(value) {
  if (!value) return '시각 없음';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTradeLine(trade = {}) {
  const side = trade.side === 'sell' ? '매도' : '매수';
  const currency = trade.currency || 'KRW';
  const unit = currency === 'KRW' ? '원' : ` ${currency}`;
  const links = [
    trade.recommendationId ? `추천${trade.recommendationLinkSource === 'auto_ticker_match' ? '(자동)' : ''}` : '',
    trade.tradePlanId ? '계획' : '',
  ].filter(Boolean).join('·');
  return [
    `▸ <b>${side}</b> ${escapeHtml(trade.name || trade.ticker || trade.symbol || 'unknown')} · ${trade.quantity}주 @ ${Number(trade.price || 0).toLocaleString('ko-KR')}${unit}`,
    `  ${tradeTime(trade.executedAt || trade.date)} · 원화 ${typeof trade.cashAmountKrw === 'number' ? formatKRW(trade.cashAmountKrw) : '환산 정보 없음'}${links ? ` · ${links} 연결` : ''}`,
    trade.side === 'sell'
      ? `  실현손익 ${typeof trade.realizedPnlKrw === 'number' ? `${formatKRW(trade.realizedPnlKrw)} (${trade.realizedReturnPct ?? 'n/a'}%)` : '원가 데이터 부족'} · 사유 ${escapeHtml(trade.sellReason || '미입력')}`
      : '',
  ].filter(Boolean).join('\n');
}

function formatRecentTradesFromStatus(status = {}, options = {}) {
  if (status.dataAvailable === false) {
    return [
      '<b>최근 실제 체결 기록</b>',
      '거래 저장소를 읽지 못했습니다. 거래 0건으로 해석하지 않습니다.',
      status.error ? `원인: ${escapeHtml(status.error)}` : '',
    ].filter(Boolean).join('\n');
  }
  const limit = options.limit || 10;
  const trades = [...(status.trades || [])]
    .sort((a, b) => new Date(b.executedAt || b.date) - new Date(a.executedAt || a.date))
    .slice(0, limit);
  return [
    '<b>최근 실제 체결 기록</b>',
    status.persistenceAvailable === false ? '상태: 로컬 백업 사용 중 · 최신성 보장 안 됨' : '',
    trades.length ? trades.map(formatTradeLine).join('\n\n') : '아직 기록된 실제 거래가 없습니다.',
    '',
    '이 목록은 증권사 주문 내역이 아니라 사용자가 승인해 기록한 체결 원장입니다.',
  ].filter(line => line !== '').join('\n');
}

async function formatRecentTrades(options = {}) {
  const status = await loadTradeExecutionsWithStatus();
  return formatRecentTradesFromStatus(status, options);
}

function formatTradePerformanceStatus(report = {}) {
  if (report.dataAvailable === false) {
    return [
      '<b>실제 거래 성과</b>',
      '거래 저장소를 읽지 못해 성과 계산을 보류합니다.',
      report.dataError ? `원인: ${escapeHtml(report.dataError)}` : '',
    ].filter(Boolean).join('\n');
  }
  const openLines = (report.positions || []).slice(0, 5).map(position => (
    `▸ ${escapeHtml(position.name || position.ticker || position.symbol)} ${position.quantity}주 · 미실현 ${typeof position.pnl === 'number' ? `${formatKRW(position.pnl)} (${position.returnPct}%)` : '현재가 데이터 부족'}`
  ));
  return [
    '<b>실제 거래 성과</b>',
    `거래 ${report.totalTrades ?? 0}건 · 매수 ${report.buyTrades ?? 0}건 · 매도 ${report.sellTrades ?? 0}건`,
    `열린 거래 기준 미실현: ${typeof report.totalPnl === 'number' && report.evaluatedBuys > 0 ? `${formatKRW(report.totalPnl)} (${report.totalReturnPct}%)` : '현재가 데이터 부족'}`,
    `매도 실현손익: ${typeof report.realizedPnl === 'number' ? `${formatKRW(report.realizedPnl)} (${report.realizedPnlKnown}건)` : '원가 데이터 부족'}`,
    `추천 연결 ${report.linkedRecommendations ?? 0}건 · 매도 사유 ${report.sellsWithReason ?? 0}/${report.sellTrades ?? 0}건`,
    openLines.length ? '' : null,
    openLines.length ? '<b>열린 거래</b>' : null,
    openLines.length ? openLines.join('\n') : null,
    '',
    '실제 계좌 전체 성과가 아니라 이 에이전트에 기록된 체결만 계산합니다.',
  ].filter(line => line !== null).join('\n');
}

async function formatCurrentTradePerformance() {
  return formatTradePerformanceStatus(await buildTradePerformanceReport());
}

module.exports = {
  formatTradeLine,
  formatRecentTradesFromStatus,
  formatRecentTrades,
  formatTradePerformanceStatus,
  formatCurrentTradePerformance,
};
