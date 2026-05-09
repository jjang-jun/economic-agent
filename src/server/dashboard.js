const { isPersistenceEnabled, selectRows } = require('../utils/persistence');
const { summarizeCollectorOps } = require('../utils/collector-ops');
const { summarizePriceSourceQuality } = require('../utils/price-source-quality');
const {
  humanizeRiskReason,
  isBuyCandidateRecommendation,
} = require('../agent/recommendations-view');

const ACTION_LABELS = {
  candidate: '매수 검토 가능',
  watch_only: '관찰만',
  blocked: '매수 차단',
  reduce: '비중 축소 검토',
  avoid: '제외',
};

const SIGNAL_LABELS = {
  bullish: '상승 후보',
  bearish: '하락/축소 후보',
  neutral: '관찰',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtKRW(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : 'n/a';
}

function fmtPct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number}%` : 'n/a';
}

function fmtPrice(value, currency = 'KRW') {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  if (currency === 'USD') return `$${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `${number.toLocaleString('ko-KR')}원`;
}

function metric(label, value) {
  return `<section class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></section>`;
}

function getDashboardSecret() {
  return process.env.DASHBOARD_SECRET
    || process.env.AGENT_DASHBOARD_SECRET
    || process.env.JOB_SECRET
    || '';
}

function getBearerToken(header = '') {
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function authorizeDashboard(req, url) {
  const expected = getDashboardSecret();
  if (!expected) {
    return { ok: false, status: 503, error: 'dashboard secret is not configured' };
  }

  const provided = req.headers['x-dashboard-secret']
    || getBearerToken(req.headers.authorization)
    || url.searchParams.get('token')
    || '';

  if (provided !== expected) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  return { ok: true };
}

async function fetchDashboardRows(table, params) {
  const result = await selectRows(table, params);
  return result.rows || [];
}

async function loadDashboardData() {
  if (!isPersistenceEnabled()) {
    return { persistenceEnabled: false };
  }

  const [
    freedomGoals,
    portfolioSnapshots,
    portfolioAccounts,
    recommendations,
    evaluations,
    collectorRuns,
    alertEvents,
    priceSnapshots,
    performanceReviews,
  ] = await Promise.all([
    fetchDashboardRows('financial_freedom_goals', {
      select: '*',
      order: 'date.desc,updated_at.desc',
      limit: '1',
    }),
    fetchDashboardRows('portfolio_snapshots', {
      select: '*',
      order: 'captured_at.desc,created_at.desc',
      limit: '1',
    }),
    fetchDashboardRows('portfolio_accounts', {
      select: '*',
      order: 'updated_at.desc',
      limit: '1',
    }),
    fetchDashboardRows('recommendations', {
      select: '*',
      order: 'created_at.desc',
      limit: '50',
    }),
    fetchDashboardRows('recommendation_evaluations', {
      select: '*',
      order: 'evaluated_at.desc,created_at.desc',
      limit: '100',
    }),
    fetchDashboardRows('collector_runs', {
      select: '*',
      order: 'started_at.desc',
      limit: '50',
    }),
    fetchDashboardRows('alert_events', {
      select: '*',
      order: 'created_at.desc',
      limit: '100',
    }),
    fetchDashboardRows('price_snapshots', {
      select: '*',
      order: 'collected_at.desc',
      limit: '500',
    }),
    fetchDashboardRows('performance_reviews', {
      select: '*',
      order: 'created_at.desc',
      limit: '1',
    }),
  ]);

  return {
    persistenceEnabled: true,
    freedom: freedomGoals[0] || null,
    portfolio: portfolioSnapshots[0] || portfolioAccounts[0] || null,
    recommendations,
    evaluations,
    collectorOps: summarizeCollectorOps(collectorRuns, alertEvents),
    priceQuality: summarizePriceSourceQuality(priceSnapshots),
    performanceReview: performanceReviews[0] || null,
    generatedAt: new Date().toISOString(),
  };
}

function average(rows, field) {
  const values = (rows || [])
    .map(row => Number(row?.[field]))
    .filter(Number.isFinite);
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function getRecommendationPayload(row = {}) {
  return row.payload || row;
}

function normalizeRecommendation(row = {}) {
  const payload = getRecommendationPayload(row);
  return {
    ...payload,
    id: row.id || payload.id,
    date: row.date || payload.date,
    createdAt: row.created_at || payload.createdAt,
    ticker: row.ticker || payload.ticker || payload.symbol,
    symbol: row.ticker || payload.symbol || payload.ticker,
    name: row.name || payload.name,
    signal: row.signal || payload.signal,
    conviction: row.conviction || payload.conviction,
    riskProfile: payload.riskProfile || payload.risk_profile || row.risk_profile || {},
    riskReview: payload.riskReview || payload.risk_review || row.risk_review || {},
  };
}

function getRiskProfile(row = {}) {
  const payload = getRecommendationPayload(row);
  return payload.riskProfile || payload.risk_profile || row.risk_profile || {};
}

function getRiskReview(row = {}) {
  const payload = getRecommendationPayload(row);
  return payload.riskReview || payload.risk_review || row.risk_review || {};
}

function getEntry(row = {}) {
  const payload = getRecommendationPayload(row);
  return payload.entry || row.entry || {};
}

function renderRecommendationRows(recommendations = []) {
  const candidates = recommendations
    .map(normalizeRecommendation)
    .filter(isBuyCandidateRecommendation)
    .slice(0, 8);

  if (candidates.length === 0) {
    return '<tr><td colspan="7" class="muted">최근 추천이 없습니다.</td></tr>';
  }

  return candidates.map(row => {
    const payload = getRecommendationPayload(row);
    const risk = getRiskProfile(row);
    const review = getRiskReview(row);
    const entry = getEntry(row);
    const currency = entry.currency || payload.marketProfile?.currency || payload.market_profile?.currency || 'KRW';
    const blockers = Array.isArray(review.blockers) ? review.blockers : [];
    const warnings = Array.isArray(review.warnings) ? review.warnings : [];
    const riskText = [...blockers.map(item => `차단: ${humanizeRiskReason(item)}`), ...warnings.map(item => `주의: ${humanizeRiskReason(item)}`)]
      .slice(0, 2)
      .join(' / ');

    return `<tr>
      <td>${escapeHtml(row.date || row.created_at || '')}</td>
      <td>${escapeHtml(row.name || payload.name || row.ticker || payload.ticker || '')}</td>
      <td>${escapeHtml(SIGNAL_LABELS[row.signal] || row.signal || '')}</td>
      <td>${escapeHtml(ACTION_LABELS[review.action] || review.action || '')}</td>
      <td>${escapeHtml(fmtPrice(risk.entryReferencePrice ?? risk.entry_reference_price ?? entry.price, currency))}</td>
      <td>${escapeHtml(fmtPrice(risk.stopLossPrice ?? risk.stop_loss_price, currency))}</td>
      <td>${escapeHtml(riskText || payload.reason || row.reason || '')}</td>
    </tr>`;
  }).join('');
}

function buildDashboardHtml(data = {}) {
  const freedom = data.freedom?.payload || data.freedom || {};
  const portfolio = data.portfolio || {};
  const collectorOps = data.collectorOps || {};
  const priceQuality = data.priceQuality || {};
  const evaluations = data.evaluations || [];
  const avgSignalReturn = average(evaluations, 'signal_return_pct');
  const avgAlpha = average(evaluations, 'alpha_pct');
  const avgDrawdown = average(evaluations, 'max_drawdown_pct');
  const progress = Math.max(0, Math.min(100, Number(freedom.targetProgressPct || data.freedom?.target_progress_pct || 0)));
  const behaviorWarnings = data.performanceReview?.payload?.behaviorReview?.warnings || [];

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Economic Agent Dashboard</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fa; color: #18212b; }
    header, main { padding: 24px; }
    header { background: #fff; border-bottom: 1px solid #d8e0e8; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    h2 { margin: 0 0 12px; font-size: 17px; }
    main { display: grid; gap: 18px; }
    .panel, .metric { background: #fff; border: 1px solid #d8e0e8; border-radius: 8px; padding: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric span { display: block; margin-bottom: 8px; color: #607080; font-size: 12px; }
    .metric strong { font-size: 21px; }
    .progress { height: 14px; background: #e4ebf2; border-radius: 999px; overflow: hidden; }
    .progress div { width: ${progress}%; height: 100%; background: #167a4a; }
    table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 8px; }
    th, td { padding: 10px; border-bottom: 1px solid #edf1f5; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #eef3f7; }
    .muted { color: #607080; }
    .warn { color: #8a5b00; }
    ul { margin: 0; padding-left: 20px; line-height: 1.7; }
    @media (max-width: 680px) { header, main { padding: 16px; } table { display: block; overflow-x: auto; } }
  </style>
</head>
<body>
  <header>
    <h1>Economic Agent Dashboard</h1>
    <div class="muted">생성 시각: ${escapeHtml(new Date(data.generatedAt || Date.now()).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}</div>
  </header>
  <main>
    ${data.persistenceEnabled === false ? '<section class="panel warn">Supabase 환경변수가 없어 대시보드를 만들 수 없습니다.</section>' : ''}
    <section class="panel">
      <h2>경제적 자유</h2>
      <div class="progress"><div></div></div>
      <p class="muted">현재 ${escapeHtml(fmtKRW(freedom.currentNetWorth ?? data.freedom?.current_net_worth))} / 목표 ${escapeHtml(fmtKRW(freedom.goal?.targetNetWorth ?? data.freedom?.target_net_worth))} · 달성률 ${escapeHtml(fmtPct(freedom.targetProgressPct ?? data.freedom?.target_progress_pct))}</p>
      <div class="grid">
        ${metric('월 저축액', fmtKRW(freedom.monthlySavingAmount ?? data.freedom?.monthly_saving_amount))}
        ${metric('예상 도달일', freedom.estimatedTargetDate || data.freedom?.estimated_target_date || 'n/a')}
        ${metric('필요 연수익률', fmtPct(freedom.requiredAnnualReturnPct ?? data.freedom?.required_annual_return_pct))}
      </div>
    </section>
    <section class="grid">
      ${metric('포트폴리오 평가액', fmtKRW(portfolio.total_asset_value))}
      ${metric('현금', fmtKRW(portfolio.cash_amount))}
      ${metric('추천 평가 평균', fmtPct(avgSignalReturn))}
      ${metric('초과수익 평균', fmtPct(avgAlpha))}
      ${metric('평균 최대낙폭', fmtPct(avgDrawdown))}
      ${metric('가격 스냅샷', `${priceQuality.totalSnapshots || 0}건`)}
    </section>
    <section class="panel">
      <h2>수집기 상태</h2>
      <div class="grid">
        ${metric('성공/완료', `${collectorOps.successfulRuns || 0}/${collectorOps.completedRuns || collectorOps.totalRuns || 0}`)}
        ${metric('실패', collectorOps.failedRuns || 0)}
        ${metric('성공률', fmtPct(collectorOps.successRatePct))}
        ${metric('대기 알림', `즉시 ${collectorOps.alertEvents?.pendingImmediate || 0} / 다이제스트 ${collectorOps.alertEvents?.pendingDigest || 0}`)}
      </div>
    </section>
    <section class="panel">
      <h2>최근 매수 검토 후보</h2>
      <p class="muted">손익비와 리스크 리뷰를 통과한 후보만 표시합니다. 차단/관찰 후보는 Telegram의 /recommendations blocked에서 확인합니다.</p>
      <table>
        <thead><tr><th>일자</th><th>종목</th><th>의견</th><th>리스크 판정</th><th>진입가</th><th>손절가</th><th>근거/차단</th></tr></thead>
        <tbody>${renderRecommendationRows(data.recommendations || [])}</tbody>
      </table>
    </section>
    <section class="panel">
      <h2>행동 경고</h2>
      ${behaviorWarnings.length
        ? `<ul>${behaviorWarnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '<p class="muted">최근 리뷰에 행동 경고가 없습니다.</p>'}
    </section>
  </main>
</body>
</html>`;
}

async function handleDashboardRequest(req, res, url) {
  const auth = authorizeDashboard(req, url);
  if (!auth.ok) {
    res.writeHead(auth.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: auth.error }));
    return;
  }

  const data = await loadDashboardData();
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
  });
  res.end(buildDashboardHtml(data));
}

module.exports = {
  authorizeDashboard,
  buildDashboardHtml,
  handleDashboardRequest,
  loadDashboardData,
};
