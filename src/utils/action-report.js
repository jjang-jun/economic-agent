const fs = require('fs');
const path = require('path');
const { getKSTDate } = require('./article-archive');

const ACTION_REPORT_DIR = path.join(__dirname, '..', '..', 'data', 'action-reports');

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isRecent(recommendation, days = 3) {
  const created = toTime(recommendation.createdAt || recommendation.date);
  if (!created) return false;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}

function convictionRank(value) {
  return { high: 3, medium: 2, low: 1 }[value] || 0;
}

function sameHolding(position, recommendation) {
  return Boolean(
    (recommendation.symbol && position.symbol === recommendation.symbol)
    || (recommendation.ticker && position.ticker === recommendation.ticker)
  );
}

function buildNewBuyCandidates(recommendations, portfolio) {
  const positions = portfolio.positions || [];
  return (recommendations || [])
    .filter(item => item.signal === 'bullish')
    .filter(item => isRecent(item))
    .filter(item => !(positions || []).some(position => sameHolding(position, item)))
    .filter(item => {
      const review = item.riskReview || item.risk_review || {};
      const risk = item.riskProfile || item.risk_profile || {};
      return review.action === 'candidate' || review.approved === true || risk.tradeable === true;
    })
    .sort((a, b) => {
      const ar = a.riskProfile || a.risk_profile || {};
      const br = b.riskProfile || b.risk_profile || {};
      return (
        convictionRank(b.conviction) - convictionRank(a.conviction)
        || (br.riskReward || 0) - (ar.riskReward || 0)
        || (br.suggestedAmount || 0) - (ar.suggestedAmount || 0)
      );
    })
    .slice(0, 5);
}

function buildWatchOnlyCandidates(recommendations, portfolio) {
  const positions = portfolio.positions || [];
  return (recommendations || [])
    .filter(item => item.signal === 'bullish')
    .filter(item => isRecent(item))
    .filter(item => !(positions || []).some(position => sameHolding(position, item)))
    .filter(item => {
      const review = item.riskReview || item.risk_review || {};
      const risk = item.riskProfile || item.risk_profile || {};
      return review.action === 'watch_only' || review.approved === false || risk.tradeable === false;
    })
    .slice(0, 5);
}

function classifyPosition(position, portfolio) {
  const stopLossPct = position.stopLossPct || portfolio.stopLossPct || 8;
  const trimProfitPct = portfolio.trimProfitPct || 20;
  const weight = typeof position.weight === 'number' ? position.weight : null;
  const pnlPct = typeof position.unrealizedPnlPct === 'number' ? position.unrealizedPnlPct : null;
  const return5dPct = typeof position.return5dPct === 'number' ? position.return5dPct : null;
  const return20dPct = typeof position.return20dPct === 'number' ? position.return20dPct : null;
  const reasons = [];
  const evidence = [];

  if (pnlPct !== null && pnlPct <= -Math.abs(stopLossPct)) {
    reasons.push(`손절 기준 ${stopLossPct}% 도달`);
    evidence.push(`현재 손익 ${pnlPct}% <= 손절 기준 -${Math.abs(stopLossPct)}%`);
    return { action: 'sell', reasons, evidence, stopLossPct };
  }

  if (weight !== null && weight > portfolio.maxPositionRatio) {
    reasons.push(`종목 비중 ${Math.round(weight * 100)}%로 한도 초과`);
    evidence.push(`비중 ${Math.round(weight * 100)}% > 한도 ${Math.round(portfolio.maxPositionRatio * 100)}%`);
  }
  if (pnlPct !== null && pnlPct >= trimProfitPct) {
    reasons.push(`수익률 ${pnlPct}%로 일부 이익 잠금 후보`);
    evidence.push(`수익률 ${pnlPct}% >= 이익잠금 기준 ${trimProfitPct}%`);
  }
  if (return5dPct !== null && return5dPct <= -5) {
    reasons.push(`5일 수익률 ${return5dPct}%로 단기 약세`);
    evidence.push(`5일 수익률 ${return5dPct}%`);
  }
  if (return20dPct !== null && return20dPct <= -10) {
    reasons.push(`20일 수익률 ${return20dPct}%로 추세 약화`);
    evidence.push(`20일 수익률 ${return20dPct}%`);
  }

  if (reasons.length > 0) return { action: 'reduce', reasons, evidence, stopLossPct };

  if (pnlPct !== null) evidence.push(`현재 손익 ${pnlPct}%`);
  if (weight !== null) evidence.push(`비중 ${Math.round(weight * 100)}%`);
  if (return5dPct !== null) evidence.push(`5일 ${return5dPct}%`);
  if (return20dPct !== null) evidence.push(`20일 ${return20dPct}%`);
  evidence.push(`손절 기준 -${Math.abs(stopLossPct)}% 미도달`);
  return { action: 'hold', reasons: ['손절/비중/추세 경고 없음'], evidence, stopLossPct };
}

function buildPositionActions(portfolio) {
  const groups = { hold: [], reduce: [], sell: [] };
  for (const position of portfolio.positions || []) {
    const result = classifyPosition(position, portfolio);
    groups[result.action].push({
      ...position,
      actionReasons: result.reasons,
      actionEvidence: result.evidence,
      actionStopLossPct: result.stopLossPct,
    });
  }
  return groups;
}

function buildActionReport({ recommendations, portfolio }) {
  const positionActions = buildPositionActions(portfolio);
  return {
    id: `${getKSTDate()}:action-report`,
    date: getKSTDate(),
    createdAt: new Date().toISOString(),
    portfolio: {
      totalAssetValue: portfolio.totalAssetValue,
      cashAmount: portfolio.cashAmount,
      cashRatio: portfolio.cashRatio,
      investedAmount: portfolio.investedAmount,
      unrealizedPnl: portfolio.unrealizedPnl,
      unrealizedPnlPct: portfolio.unrealizedPnlPct,
      positionCount: (portfolio.positions || []).length,
      maxNewBuyAmount: portfolio.maxNewBuyAmount,
      maxNewBuyRatio: portfolio.maxNewBuyRatio,
      maxPositionRatio: portfolio.maxPositionRatio,
    },
    newBuyCandidates: buildNewBuyCandidates(recommendations, portfolio),
    watchOnlyCandidates: buildWatchOnlyCandidates(recommendations, portfolio),
    holdCandidates: positionActions.hold,
    reduceCandidates: positionActions.reduce,
    sellCandidates: positionActions.sell,
  };
}

function saveActionReport(report) {
  fs.mkdirSync(ACTION_REPORT_DIR, { recursive: true });
  const file = path.join(ACTION_REPORT_DIR, `${report.date}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  return file;
}

module.exports = {
  ACTION_REPORT_DIR,
  buildActionReport,
  buildNewBuyCandidates,
  buildWatchOnlyCandidates,
  buildPositionActions,
  classifyPosition,
  saveActionReport,
};
