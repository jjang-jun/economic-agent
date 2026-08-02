const fs = require('fs');
const path = require('path');
const {
  loadResearchCandidates,
  saveResearchCandidates,
  buildResearchCandidatesFromReports,
} = require('../src/utils/research-candidate-log');
const { persistResearchCandidates } = require('../src/utils/persistence');

function readReports(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('stock report mirror must be a JSON array');
  return parsed;
}

async function main() {
  const file = process.env.SUPABASE_STOCK_REPORT_MIRROR
    || path.join(__dirname, '..', 'data', 'supabase', 'stock_reports.json');
  const reports = readReports(file);
  const existing = await loadResearchCandidates();
  const result = await buildResearchCandidatesFromReports(reports, existing);
  saveResearchCandidates(result.candidates);
  const persisted = await persistResearchCandidates(result.candidates);
  if (persisted.error) throw new Error(`Shadow 후보 백필 저장 실패: ${persisted.error.message}`);
  console.log(`[research-backfill] reports=${reports.length} added=${result.added} skipped=${result.skipped} total=${result.candidates.length}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[research-backfill] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { readReports };
