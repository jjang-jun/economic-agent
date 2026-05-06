const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'supabase');
const OUT_DIR = path.join(__dirname, '..', 'data', 'dashboard');
const OUT_FILE = path.join(OUT_DIR, 'index.html');

function readTable(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), 'utf-8'));
  } catch {
    return [];
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

function buildDashboard() {
  const articles = readTable('articles');
  const recommendations = readTable('recommendations');
  const trades = readTable('trade_executions');
  const portfolio = readTable('portfolio_snapshots');
  const investorFlows = readTable('investor_flows');
  const latestPortfolio = portfolio[0] || {};
  const latestFlow = investorFlows[0] || {};
  const latestRecommendations = recommendations.slice(0, 12);

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
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d9e0e7; border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #edf1f5; font-size: 13px; vertical-align: top; }
    th { background: #eef3f7; color: #384858; }
    @media (max-width: 640px) { header, main { padding-left: 16px; padding-right: 16px; } table { display: block; overflow-x: auto; } }
  </style>
</head>
<body>
  <header>
    <h1>Economic Agent Dashboard</h1>
    <div>Generated ${escapeHtml(new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}</div>
  </header>
  <main>
    <div class="grid">
      ${metric('Articles', articles.length)}
      ${metric('Recommendations', recommendations.length)}
      ${metric('Trade Executions', trades.length)}
      ${metric('Portfolio Value', latestPortfolio.total_asset_value ? `${Number(latestPortfolio.total_asset_value).toLocaleString('ko-KR')}원` : 'n/a')}
      ${metric('Cash', latestPortfolio.cash_amount ? `${Number(latestPortfolio.cash_amount).toLocaleString('ko-KR')}원` : 'n/a')}
      ${metric('Investor Flow', latestFlow.foreign_net_buy ? `외국인 ${Number(latestFlow.foreign_net_buy).toLocaleString('ko-KR')}억` : 'n/a')}
    </div>
    <section>
      <h2>Latest Recommendations</h2>
      <table>
        <thead><tr><th>Date</th><th>Name</th><th>Signal</th><th>Conviction</th><th>Risk Review</th><th>Reason</th></tr></thead>
        <tbody>
          ${latestRecommendations.map(item => row([
            item.date,
            item.name,
            item.signal,
            item.conviction,
            item.risk_review?.action || item.payload?.riskReview?.action || '',
            item.reason,
          ])).join('')}
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
