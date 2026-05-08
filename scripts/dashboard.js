const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'supabase');
const FREEDOM_FILE = path.join(__dirname, '..', 'data', 'freedom', 'freedom-status.json');
const OUT_DIR = path.join(__dirname, '..', 'data', 'dashboard');
const OUT_FILE = path.join(OUT_DIR, 'index.html');
const { summarizeCollectorOps } = require('../src/utils/collector-ops');
const { summarizePriceSourceQuality } = require('../src/utils/price-source-quality');

function readTable(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), 'utf-8'));
  } catch {
    return [];
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function metric(label, value) {
  return `<section class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></section>`;
}

function row(cells) {
  return `<tr>${cells.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`;
}

function fmtPct(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : 'n/a';
}

function fmtNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR') : 'n/a';
}

function fmtKRW(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('ko-KR')}원` : 'n/a';
}

function fmtMonths(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const years = Math.floor(value / 12);
  const months = value % 12;
  if (years <= 0) return `${months}개월`;
  if (months === 0) return `${years}년`;
  return `${years}년 ${months}개월`;
}

function fmtPrice(value, currency = 'KRW') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  if (currency === 'USD') return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `${value.toLocaleString('ko-KR')}원`;
}

function latestByDate(rows, fields = ['created_at', 'generated_at', 'end_date', 'date']) {
  return [...(rows || [])].sort((a, b) => {
    const left = fields.map(field => a?.[field]).find(Boolean) || '';
    const right = fields.map(field => b?.[field]).find(Boolean) || '';
    return String(right).localeCompare(String(left));
  })[0] || null;
}

function getRecommendationPayload(item = {}) {
  return item.payload || item;
}

function getRiskProfile(item = {}) {
  const payload = getRecommendationPayload(item);
  return payload.riskProfile || payload.risk_profile || item.risk_profile || {};
}

function getRiskReview(item = {}) {
  const payload = getRecommendationPayload(item);
  return payload.riskReview || payload.risk_review || item.risk_review || {};
}

function getEntry(item = {}) {
  const payload = getRecommendationPayload(item);
  return payload.entry || item.entry || {};
}

function getCurrency(item = {}) {
  const entry = getEntry(item);
  const market = getRecommendationPayload(item).marketProfile || getRecommendationPayload(item).market_profile || item.market_profile || {};
  return entry.currency || market.currency || 'KRW';
}

function getEntryPrice(item = {}) {
  const risk = getRiskProfile(item);
  const entry = getEntry(item);
  return Number(risk.entryReferencePrice ?? risk.entry_reference_price ?? entry.price);
}

function getStopPrice(item = {}) {
  const risk = getRiskProfile(item);
  return Number(risk.stopLossPrice ?? risk.stop_loss_price);
}

function getSuggestedAmount(item = {}) {
  const risk = getRiskProfile(item);
  return Number(risk.suggestedAmount ?? risk.suggested_amount);
}

function compactRiskText(item = {}, limit = 3) {
  const review = getRiskReview(item);
  const blockers = Array.isArray(review.blockers) ? review.blockers : [];
  const warnings = Array.isArray(review.warnings) ? review.warnings : [];
  return [...blockers.map(value => `차단: ${value}`), ...warnings.map(value => `경고: ${value}`)]
    .slice(0, limit)
    .join(' / ');
}

function summarizeRiskEvents(recommendations = []) {
  const events = new Map();
  for (const item of recommendations) {
    const review = getRiskReview(item);
    const candidates = [
      ...(Array.isArray(review.blockers) ? review.blockers.map(value => `차단: ${value}`) : []),
      ...(Array.isArray(review.warnings) ? review.warnings.map(value => `경고: ${value}`) : []),
    ];
    for (const event of candidates) {
      const normalized = String(event || '').trim();
      if (!normalized) continue;
      events.set(normalized, (events.get(normalized) || 0) + 1);
    }
  }
  return [...events.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([event, count]) => ({ event, count }));
}

function average(rows, field) {
  const values = (rows || [])
    .map(row => Number(row?.[field]))
    .filter(value => Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function buildEvaluationSummary(evaluations) {
  const rows = evaluations || [];
  return {
    total: rows.length,
    avgSignalReturnPct: average(rows, 'signal_return_pct'),
    avgAlphaPct: average(rows, 'alpha_pct'),
    avgMaxDrawdownPct: average(rows, 'max_drawdown_pct'),
    stopTouched: rows.filter(row => row.stop_touched === true).length,
    targetTouched: rows.filter(row => row.target_touched === true).length,
  };
}

function buildDashboard() {
  const articles = readTable('articles');
  const recommendations = readTable('recommendations');
  const trades = readTable('trade_executions');
  const portfolio = readTable('portfolio_snapshots');
  const investorFlows = readTable('investor_flows');
  const performanceReviews = readTable('performance_reviews');
  const evaluations = readTable('recommendation_evaluations');
  const collectorRuns = readTable('collector_runs');
  const alertEvents = readTable('alert_events');
  const priceSnapshots = readTable('price_snapshots');
  const latestPortfolio = portfolio[0] || {};
  const latestFlow = investorFlows[0] || {};
  const latestRecommendations = recommendations.slice(0, 12);
  const riskEvents = summarizeRiskEvents(latestRecommendations);
  const latestReview = latestByDate(performanceReviews);
  const reviewPayload = latestReview?.payload || {};
  const behaviorWarnings = reviewPayload.behaviorReview?.warnings || [];
  const lab = reviewPayload.performanceLab || {};
  const missed = lab.missedRecommendationQuality || {};
  const evalSummary = buildEvaluationSummary(evaluations);
  const collectorOps = summarizeCollectorOps(collectorRuns, alertEvents);
  const priceQuality = summarizePriceSourceQuality(priceSnapshots);
  const freedom = readJson(FREEDOM_FILE) || {};
  const freedomGoal = freedom.goal || {};
  const progress = typeof freedom.targetProgressPct === 'number' ? Math.max(0, Math.min(100, freedom.targetProgressPct)) : 0;
  const requiredReturn = typeof freedom.requiredAnnualReturnPct === 'number' ? `${freedom.requiredAnnualReturnPct}%` : 'n/a';
  const expectedReturn = typeof freedom.expectedAnnualReturnPct === 'number' ? `${freedom.expectedAnnualReturnPct}%` : 'n/a';
  const targetDateGap = freedom.targetMonths && freedom.monthsToTarget
    ? freedom.monthsToTarget - freedom.targetMonths
    : null;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Economic Agent Dashboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: #17202a; background: #f5f7f9; }
    header { padding: 24px 32px 12px; background: #fff; border-bottom: 1px solid #d9e0e7; }
    main { padding: 24px 32px; display: grid; gap: 24px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 0 0 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric, .panel { background: #fff; border: 1px solid #d9e0e7; border-radius: 8px; padding: 16px; }
    .metric span { display: block; font-size: 12px; color: #697887; margin-bottom: 8px; }
    .metric strong { font-size: 22px; }
    .hero { background: #fff; border: 1px solid #d9e0e7; border-radius: 8px; padding: 20px; display: grid; gap: 18px; }
    .hero-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
    .hero-title { margin: 0; font-size: 20px; }
    .hero-sub { margin: 6px 0 0; color: #697887; }
    .progress { height: 14px; border-radius: 999px; background: #e8eef4; overflow: hidden; }
    .progress > div { height: 100%; background: #167a4a; width: ${progress}%; }
    .status { padding: 4px 10px; border-radius: 999px; background: #e8eef4; font-size: 12px; }
    .status.warn { background: #fff3d6; color: #765000; }
    .status.ok { background: #daf3e3; color: #155c31; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d9e0e7; border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #edf1f5; font-size: 13px; vertical-align: top; }
    th { background: #eef3f7; color: #384858; }
    .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .list { margin: 0; padding-left: 18px; line-height: 1.65; }
    .muted { color: #697887; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e8eef4; font-size: 12px; }
    .warn { background: #fff3d6; color: #765000; }
    .ok { background: #daf3e3; color: #155c31; }
    .failed { background: #ffe1df; color: #8f1d16; }
    @media (max-width: 640px) { header, main { padding-left: 16px; padding-right: 16px; } table { display: block; overflow-x: auto; } }
  </style>
</head>
<body>
  <header>
    <h1>Economic Agent Dashboard</h1>
    <div>Generated ${escapeHtml(new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}</div>
  </header>
  <main>
    <section class="hero">
      <div class="hero-head">
        <div>
          <h2 class="hero-title">Freedom Operating View</h2>
          <p class="hero-sub">경제적 자유 목표, 현재 자산, 필요한 수익률, 하락 스트레스를 먼저 봅니다.</p>
        </div>
        <span class="status ${targetDateGap !== null && targetDateGap > 0 ? 'warn' : 'ok'}">
          ${targetDateGap !== null && targetDateGap > 0 ? `목표보다 ${escapeHtml(fmtMonths(targetDateGap))} 지연` : '목표 속도 정상'}
        </span>
      </div>
      <div>
        <div class="progress" aria-label="Freedom progress"><div></div></div>
        <p class="muted">달성률 ${escapeHtml(freedom.targetProgressPct ?? 'n/a')}% · 현재 ${escapeHtml(fmtKRW(Number(freedom.currentNetWorth)))} / 목표 ${escapeHtml(fmtKRW(Number(freedomGoal.targetNetWorth)))}</p>
      </div>
      <div class="grid">
        ${metric('월 생활비', fmtKRW(Number(freedomGoal.monthlyLivingCost)))}
        ${metric('월 저축액', fmtKRW(Number(freedom.monthlySavingAmount)))}
        ${metric('목표 인출률', freedomGoal.targetWithdrawalRate ? `${Math.round(Number(freedomGoal.targetWithdrawalRate) * 1000) / 10}%` : 'n/a')}
        ${metric('예상 도달', freedom.estimatedTargetDate || 'n/a')}
        ${metric('목표일', freedom.targetDate || freedomGoal.targetDate || 'n/a')}
        ${metric('필요 연수익률', requiredReturn)}
        ${metric('가정 연수익률', expectedReturn)}
        ${metric('20% 하락 시 지연', freedom.stress ? fmtMonths(freedom.stress.delayMonths) : 'n/a')}
      </div>
    </section>
    <div class="grid">
      ${metric('Articles', articles.length)}
      ${metric('Recommendations', recommendations.length)}
      ${metric('Trade Executions', trades.length)}
      ${metric('Portfolio Value', latestPortfolio.total_asset_value ? fmtKRW(Number(latestPortfolio.total_asset_value)) : 'n/a')}
      ${metric('Cash', latestPortfolio.cash_amount ? fmtKRW(Number(latestPortfolio.cash_amount)) : 'n/a')}
      ${metric('Investor Flow', latestFlow.foreign_net_buy ? `외국인 ${fmtNumber(Number(latestFlow.foreign_net_buy))}억` : 'n/a')}
    </div>
    <section class="split">
      <div class="panel">
        <h2>Recommendation Quality</h2>
        <div class="grid">
          ${metric('Evaluations', evalSummary.total)}
          ${metric('Avg Signal Return', fmtPct(evalSummary.avgSignalReturnPct))}
          ${metric('Avg Alpha', fmtPct(evalSummary.avgAlphaPct))}
          ${metric('Avg Drawdown', fmtPct(evalSummary.avgMaxDrawdownPct))}
          ${metric('Stop Touched', evalSummary.stopTouched)}
          ${metric('Target Touched', evalSummary.targetTouched)}
        </div>
        <p class="muted">Signal return은 추천 방향 기준 수익률입니다. bullish는 상승 수익률, bearish는 하락 시 유리한 방향으로 평가합니다.</p>
        ${typeof missed.avgSignalReturnPct === 'number' ? `<p>미실행 추천 평균 신호수익률: <b>${fmtPct(missed.avgSignalReturnPct)}</b></p>` : ''}
      </div>
      <div class="panel">
        <h2>Collector Ops</h2>
        <p><span class="badge ${escapeHtml(collectorOps.healthLabel || 'ok')}">${escapeHtml(collectorOps.healthLabel || 'ok')}</span></p>
        <div class="grid">
          ${metric('Runs', `${collectorOps.successfulRuns}/${collectorOps.completedRuns || collectorOps.totalRuns}`)}
          ${metric('Failures', collectorOps.failedRuns)}
          ${metric('Success Rate', fmtPct(collectorOps.successRatePct))}
          ${metric('Max Lookback', collectorOps.maxLookbackMinutes !== null ? `${collectorOps.maxLookbackMinutes}분` : 'n/a')}
          ${metric('Immediate Sent', collectorOps.alertEvents.sentImmediate)}
          ${metric('Pending Digest', collectorOps.alertEvents.pendingDigest)}
          ${metric('Pending Catch-up', collectorOps.alertEvents.pendingCatchUp)}
        </div>
      </div>
    </section>
    <section class="panel">
      <h2>Price Source Quality</h2>
      <div class="grid">
        ${metric('Snapshots', `${priceQuality.totalSnapshots}건 / ${priceQuality.tickerCount}종목`)}
        ${metric('EOD Official', priceQuality.officialEod.ratePct !== null ? `${priceQuality.officialEod.ratePct}%` : 'n/a')}
        ${metric('KRX', `${priceQuality.officialEod.krx}건`)}
        ${metric('Data.go.kr', `${priceQuality.officialEod.dataGoKr}건`)}
        ${metric('KIS EOD fallback', `${priceQuality.kisEodFallback}건`)}
        ${metric('Naver/Yahoo fallback', priceQuality.fallback.ratePct !== null ? `${priceQuality.fallback.ratePct}%` : 'n/a')}
        ${metric('Stale Suspect', `${priceQuality.staleSnapshots}건`)}
      </div>
      <p class="muted">가격 품질은 Supabase 미러의 price_snapshots 기준입니다. 최신 상태는 npm run db:pull 이후 다시 생성해야 합니다.</p>
    </section>
    <section class="panel">
      <h2>Behavior Warnings</h2>
      ${behaviorWarnings.length > 0
        ? `<ul class="list">${behaviorWarnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '<p class="muted">최근 리뷰에 행동 경고가 없습니다.</p>'}
    </section>
    <section class="panel">
      <h2>Recommendation Risk Events</h2>
      ${riskEvents.length > 0
        ? `<ul class="list">${riskEvents.map(item => `<li>${escapeHtml(item.event)} <span class="badge">${escapeHtml(item.count)}건</span></li>`).join('')}</ul>`
        : '<p class="muted">최근 추천에 누적된 차단/경고 이벤트가 없습니다.</p>'}
    </section>
    <section>
      <h2>Latest Recommendations</h2>
      <table>
        <thead><tr><th>Date</th><th>Name</th><th>Signal</th><th>Conviction</th><th>Entry</th><th>Stop</th><th>Suggested</th><th>Risk Review</th><th>Risk Events</th><th>Reason</th></tr></thead>
        <tbody>
          ${latestRecommendations.map(item => {
            const currency = getCurrency(item);
            return row([
              item.date,
              item.name,
              item.signal,
              item.conviction,
              fmtPrice(getEntryPrice(item), currency),
              fmtPrice(getStopPrice(item), currency),
              fmtKRW(getSuggestedAmount(item)),
              getRiskReview(item).action || '',
              compactRiskText(item),
              item.reason,
            ]);
          }).join('')}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, buildDashboard());
  console.log(`[Dashboard] ${OUT_FILE}`);
}

main();
