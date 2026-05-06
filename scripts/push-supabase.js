const { spawnSync } = require('child_process');

const projectUrl = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
const explicitDbUrl = process.env.SUPABASE_DB_URL;
const password = process.env.SUPABASE_DB_PASSWORD;

function getProjectRef(url) {
  try {
    const host = new URL(url).hostname;
    return host.split('.')[0];
  } catch {
    return '';
  }
}

function main() {
  const projectRef = getProjectRef(projectUrl);
  const dbUrl = explicitDbUrl
    || (projectRef && password
      ? `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`
      : '');

  if (!dbUrl) {
    console.error('SUPABASE_DB_URL or SUPABASE_PROJECT_URL/SUPABASE_URL + SUPABASE_DB_PASSWORD is required.');
    process.exit(1);
  }

  const dnsResolver = process.env.SUPABASE_DNS_RESOLVER || 'https';
  const result = spawnSync('supabase', ['db', 'push', '--dns-resolver', dnsResolver, '--db-url', dbUrl], {
    stdio: 'inherit',
  });

  process.exit(result.status || 0);
}

main();
