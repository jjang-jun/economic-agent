const { formatKRW } = require('../utils/decision-engine');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pct(value, digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedKRW(value) {
  if (typeof value !== 'number') return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatKRW(value)}`;
}

function formatPortfolioStatus(portfolio) {
  const positions = portfolio.positions || [];
  const top = [...positions]
    .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
    .slice(0, 5)
    .map(position => {
      const pnl = typeof position.unrealizedPnl === 'number'
        ? ` · ${formatSignedKRW(position.unrealizedPnl)} (${position.unrealizedPnlPct ?? 'n/a'}%)`
        : '';
      const source = position.quoteSource ? ` · ${escapeHtml(position.quoteSource)}` : '';
      return `▸ ${escapeHtml(position.name || position.ticker || position.symbol)} ${pct(position.weight)}${pnl}${source}`;
    });

  return [
    '<b>포트폴리오 상태</b>',
    `총자산: <b>${formatKRW(portfolio.totalAssetValue)}</b>`,
    `현금: ${formatKRW(portfolio.cashAmount)} (${pct(portfolio.cashRatio)})`,
    `평가손익: ${formatSignedKRW(portfolio.unrealizedPnl)} (${portfolio.unrealizedPnlPct ?? 'n/a'}%)`,
    `보유: ${positions.length}개`,
    '',
    '<b>상위 보유</b>',
    top.length > 0 ? top.join('\n') : '▸ 보유 종목 없음',
    '',
    `데이터 기준: ${escapeHtml(portfolio.capturedAt || new Date().toISOString())}`,
  ].join('\n');
}

function formatGoalStatus(status) {
  const goal = status.goal || {};
  return [
    '<b>경제적 자유 상태</b>',
    `목표 순자산: <b>${formatKRW(goal.targetNetWorth)}</b>`,
    `현재 순자산: ${formatKRW(status.currentNetWorth)} (${status.targetProgressPct ?? 'n/a'}%)`,
    `월 저축액: ${formatKRW(status.monthlySavingAmount)}`,
    `예상 달성일: ${escapeHtml(status.estimatedTargetDate || 'n/a')}`,
    `목표일 필요 연수익률: ${status.requiredAnnualReturnPct ?? 'n/a'}%`,
    `하락 스트레스: -${status.stress?.drawdownPct ?? 'n/a'}% 시 ${status.stress?.delayMonths ?? 'n/a'}개월 지연`,
    '',
    `데이터 기준: ${escapeHtml(status.generatedAt || new Date().toISOString())}`,
  ].join('\n');
}

function formatRiskStatus({ portfolio, policy }) {
  const capital = policy.capitalRules || {};
  const riskAmount = typeof portfolio.totalAssetValue === 'number'
    ? portfolio.totalAssetValue * (capital.maxSingleTradeRiskPct || 0.01)
    : null;
  const overweight = (portfolio.positions || [])
    .filter(position => typeof position.weight === 'number' && position.weight > (portfolio.maxPositionRatio || capital.maxSinglePositionPct || 0.15))
    .map(position => `▸ ${escapeHtml(position.name || position.ticker)} 비중 ${pct(position.weight)} 초과`);
  const sectorWeights = (portfolio.positions || []).reduce((acc, position) => {
    if (!position.sector || typeof position.weight !== 'number') return acc;
    acc[position.sector] = (acc[position.sector] || 0) + position.weight;
    return acc;
  }, {});
  const sectorLimit = portfolio.maxSectorRatio || capital.maxSectorPct || 0.35;
  const sectorWarnings = Object.entries(sectorWeights)
    .filter(([, weight]) => weight > sectorLimit)
    .map(([sector, weight]) => `▸ ${escapeHtml(sector)} ${pct(weight)} 초과`);

  return [
    '<b>리스크 상태</b>',
    `거래당 최대 손실: ${formatKRW(riskAmount)} (${((capital.maxSingleTradeRiskPct || 0.01) * 100).toFixed(1)}%)`,
    `신규 매수 1회 상한: ${formatKRW(portfolio.totalAssetValue * (portfolio.maxNewBuyRatio || capital.defaultMaxNewBuyPct || 0.05))}`,
    `현금 비중: ${pct(portfolio.cashRatio)}`,
    `레버리지/미수: ${policy.leverageRules?.allowMargin || policy.leverageRules?.allowMisu ? '주의 필요' : '금지'}`,
    '',
    '<b>비중 경고</b>',
    [...overweight, ...sectorWarnings].length > 0
      ? [...overweight, ...sectorWarnings].join('\n')
      : '▸ 종목/섹터 한도 초과 없음',
    '',
    `데이터 기준: ${escapeHtml(portfolio.capturedAt || new Date().toISOString())}`,
  ].join('\n');
}

function formatHelp() {
  return [
    '<b>Economic Agent 명령어</b>',
    '/portfolio - 현재 포트폴리오 요약',
    '/goal - 경제적 자유 목표 상태',
    '/risk - 현재 리스크 한도와 비중 경고',
    '/help - 명령어 보기',
    '',
    '매수/매도/현금 변경은 아직 기록하지 않습니다. 다음 단계에서 승인 버튼 기반 pending action으로 추가합니다.',
  ].join('\n');
}

module.exports = {
  escapeHtml,
  formatPortfolioStatus,
  formatGoalStatus,
  formatRiskStatus,
  formatHelp,
};
