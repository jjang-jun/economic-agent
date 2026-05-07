const baseUrl = process.env.AGENT_BASE_URL || process.argv[2];
const jobSecret = process.env.JOB_SECRET || process.env.NEWS_COLLECTOR_JOB_SECRET;
const triggerSource = process.env.COLLECTOR_TRIGGER_SOURCE || 'manual_probe';

async function main() {
  if (!baseUrl) throw new Error('AGENT_BASE_URL or argv[2] is required');
  if (!jobSecret) throw new Error('JOB_SECRET or NEWS_COLLECTOR_JOB_SECRET is required');

  const url = new URL('/jobs/news-collector', baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-job-secret': jobSecret,
      'x-trigger-source': triggerSource,
    },
  });
  const body = await res.text();

  if (!res.ok) {
    throw new Error(`news collector call failed: ${res.status} ${body}`);
  }

  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body);
  }
}

main().catch(err => {
  console.error(`[NewsCollector] ${err.message}`);
  process.exit(1);
});
