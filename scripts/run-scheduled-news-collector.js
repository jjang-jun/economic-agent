const { runNewsCollector } = require('../src/jobs/run-news-collector');

function getKstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  return {
    weekday: parts.find(part => part.type === 'weekday')?.value,
    hour: Number(parts.find(part => part.type === 'hour')?.value),
  };
}

function isCollectorWindow(date = new Date()) {
  const { weekday, hour } = getKstParts(date);
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  return isWeekday && hour >= 7 && hour <= 23;
}

async function main() {
  if (!isCollectorWindow()) {
    console.log('[Collector] outside KST weekday 07:00-23:59 window, skip');
    return;
  }

  await runNewsCollector({
    triggerSource: process.env.COLLECTOR_TRIGGER_SOURCE || 'platform_cron',
  });
}

if (require.main === module) {
  main().catch(err => {
    console.error('[Collector]', err);
    process.exit(1);
  });
}

module.exports = {
  getKstParts,
  isCollectorWindow,
};
