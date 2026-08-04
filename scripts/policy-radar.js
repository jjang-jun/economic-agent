const { runPolicyRadar } = require('../src/jobs/run-policy-radar');

function parseArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes('--dry-run') || argv.includes('--dryRun'),
    noTelegram: argv.includes('--no-telegram') || argv.includes('--noTelegram'),
    includeEmpty: argv.includes('--include-empty'),
  };
}

async function main() {
  await runPolicyRadar({
    ...parseArgs(),
    triggerSource: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'github_schedule' : 'cli',
  });
}

if (require.main === module) {
  main().catch(err => {
    console.error('[정책레이더] 실패:', err.message);
    process.exit(1);
  });
}

module.exports = { parseArgs };
