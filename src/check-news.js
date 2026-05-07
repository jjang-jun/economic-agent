const { runNewsCollector } = require('./jobs/run-news-collector');

async function main() {
  await runNewsCollector({
    triggerSource: process.env.COLLECTOR_TRIGGER_SOURCE || 'cli',
  });
}

main().catch(err => {
  console.error('[에러]', err);
  process.exit(1);
});
