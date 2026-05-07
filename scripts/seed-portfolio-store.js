const { loadPortfolio } = require('../src/utils/portfolio');
const { saveStoredPortfolio } = require('../src/utils/portfolio-store');

async function main() {
  const portfolio = loadPortfolio();
  const result = await saveStoredPortfolio(portfolio);
  console.log(`[portfolio-store] saved account default:main, positions ${result.positions ?? 0}`);
}

main().catch(err => {
  console.error('[portfolio-store] seed failed:', err.message);
  process.exit(1);
});
