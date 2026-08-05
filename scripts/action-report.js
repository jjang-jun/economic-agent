const { loadRecommendations } = require('../src/utils/recommendation-log');
const { loadPortfolio, enrichPortfolio } = require('../src/utils/portfolio');
const { loadStoredPortfolio, saveStoredPortfolio } = require('../src/utils/portfolio-store');
const {
  buildActionReport,
  buildPortfolioValuationContext,
  buildMarketMomentumCandidates,
  enrichRecommendationsWithLatestPrices,
  saveActionReport,
} = require('../src/utils/action-report');
const { loadOpenTradePlans } = require('../src/utils/trade-plan');
const { sendActionReport, formatActionReport } = require('../src/notify/reports');

function hasFlag(name) {
  return process.argv.includes(name);
}

function shouldSkipReport(argv = process.argv) {
  return argv.includes('--no-report');
}

function isPlanRelevantToPortfolio(plan = {}, portfolio = {}) {
  if (plan.side !== 'sell') return true;
  const positions = portfolio.positions || [];
  return positions.some(position => (
    (plan.ticker && position.ticker === plan.ticker)
    || (plan.symbol && position.symbol === plan.symbol)
  ));
}

function assertCompletePortfolioValuation(portfolio = {}) {
  const incomplete = (portfolio.positions || []).filter(position => (
    typeof position.marketValue !== 'number' || !Number.isFinite(position.marketValue)
  ));
  if (incomplete.length > 0) {
    const names = incomplete.map(position => position.name || position.ticker || position.symbol).join(', ');
    throw new Error(`포트폴리오 평가액이 없는 종목이 있어 원본 동기화를 중단합니다: ${names}`);
  }
  if (typeof portfolio.totalAssetValue !== 'number' || !Number.isFinite(portfolio.totalAssetValue)) {
    throw new Error('포트폴리오 총자산 평가액이 없어 원본 동기화를 중단합니다.');
  }
  return true;
}

async function main() {
  const [recommendations, storedPortfolio] = await Promise.all([
    loadRecommendations(),
    loadStoredPortfolio(),
  ]);
  const portfolioInput = storedPortfolio || loadPortfolio();
  const portfolio = await enrichPortfolio(portfolioInput);
  assertCompletePortfolioValuation(portfolio);
  let synchronized = false;
  if (storedPortfolio) {
    const syncResult = await saveStoredPortfolio(portfolio);
    synchronized = syncResult.saved === 1;
    if (!synchronized) throw new Error('최신 포트폴리오 평가액을 Supabase 원본에 동기화하지 못했습니다.');
  }
  const portfolioValuation = buildPortfolioValuationContext(portfolioInput, portfolio, {
    synchronized,
    source: storedPortfolio ? 'supabase_portfolio' : 'local_portfolio',
  });
  const enrichedRecommendations = await enrichRecommendationsWithLatestPrices(recommendations, portfolio);
  const momentumCandidates = await buildMarketMomentumCandidates({
    recommendations: enrichedRecommendations,
    portfolio,
  });
  const report = buildActionReport({
    recommendations: enrichedRecommendations,
    portfolio,
    plannedTrades: loadOpenTradePlans({ upcomingDays: 1 })
      .filter(plan => isPlanRelevantToPortfolio(plan, portfolio)),
    momentumCandidates,
    portfolioValuation,
  });
  const file = saveActionReport(report);

  console.log(`[행동리포트] 저장: ${file}`);
  console.log(`[행동리포트] 신규 ${report.newBuyCandidates.length}건, 관찰 ${report.watchOnlyCandidates.length}건, 모멘텀 ${report.momentumWatchCandidates.length}건, 보유 ${report.holdCandidates.length}건, 축소 ${report.reduceCandidates.length}건, 매도 ${report.sellCandidates.length}건`);
  console.log(`[행동리포트] 포트폴리오 평가 ${portfolioValuation.quotePositionCount}/${portfolioValuation.positionCount}개 가격 갱신 · Supabase 동기화 ${synchronized ? '완료' : '해당 없음'}`);

  if (shouldSkipReport()) {
    console.log(formatActionReport(report));
    return;
  }

  const sent = await sendActionReport(report);
  if (!sent) throw new Error('행동 리포트 전송 실패');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[행동리포트] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = {
  hasFlag,
  assertCompletePortfolioValuation,
  isPlanRelevantToPortfolio,
  shouldSkipReport,
};
