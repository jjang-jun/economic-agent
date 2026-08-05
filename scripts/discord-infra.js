const { DISCORD_CHANNELS } = require('../src/config/discord-channels');
const {
  inspectDiscordConfiguration,
  sendDiscordMessage,
} = require('../src/notify/discord');

function parseArgs(argv = process.argv.slice(2)) {
  const channelArg = argv.find(arg => arg.startsWith('--channel='));
  const requestedChannel = channelArg ? channelArg.slice('--channel='.length).trim() : '';
  return {
    sendTest: argv.includes('--send-test') || argv.includes('--sendTest'),
    channel: requestedChannel || 'ops',
  };
}

function githubRunUrl(env = process.env) {
  if (!env.GITHUB_SERVER_URL || !env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) return '';
  return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

function buildSmokeMessage({ target, configured, total, now = new Date(), env = process.env }) {
  const scheduled = env.GITHUB_EVENT_NAME === 'schedule';
  const sha = String(env.GITHUB_SHA || '').slice(0, 7);
  const runUrl = env.GITHUB_RUN_URL || githubRunUrl(env);
  return [
    '**Discord 전송 상태: 정상**',
    `점검 방식: ${scheduled ? '평일 장전 자동 점검' : '수동 점검'}`,
    `Webhook 설정: **${configured}/${total}개 정상**`,
    `수신 채널: \`#${target.name}\``,
    sha ? `배포 커밋: \`${sha}\`` : '',
    `점검 시각: ${now.toISOString()}`,
    runUrl ? `[GitHub Actions 실행 보기](${runUrl})` : '',
  ].filter(Boolean).join('\n');
}

function formatConfigurationReport(rows) {
  const lines = ['[Discord] 채널 인프라 설정'];
  for (const row of rows) {
    const status = !row.valid ? '잘못된 URL' : (row.configured ? `설정됨 (${row.source})` : '미설정');
    lines.push(`- ${row.key} (#${row.name}): ${status}`);
  }
  return lines.join('\n');
}

async function main(options = parseArgs()) {
  if (!DISCORD_CHANNELS[options.channel]) {
    throw new Error(`Unknown Discord channel: ${options.channel}`);
  }
  const rows = inspectDiscordConfiguration();
  console.log(formatConfigurationReport(rows));
  const invalid = rows.filter(row => !row.valid);
  if (invalid.length > 0) throw new Error(`Discord webhook URL ${invalid.length}개가 유효하지 않습니다.`);
  const configured = rows.filter(row => row.configured);
  if (configured.length === 0) {
    throw new Error('Discord webhook이 하나도 설정되지 않았습니다. docs/DISCORD_SETUP.md를 확인하세요.');
  }
  if (!options.sendTest) return { configured: configured.length, sent: false };

  const target = rows.find(row => row.key === options.channel);
  if (!target?.configured) throw new Error(`Discord ${options.channel} 채널 webhook이 설정되지 않았습니다.`);
  const result = await sendDiscordMessage(buildSmokeMessage({
    target,
    configured: configured.length,
    total: rows.length,
  }), {
    channel: options.channel,
    requireDelivery: true,
    reportHtml: false,
    username: 'Economic Agent',
  });
  console.log(`[Discord] #${target.name} smoke 전송 완료 (${result.messageCount}개 메시지)`);
  return { configured: configured.length, sent: true, ...result };
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[Discord] ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  githubRunUrl,
  buildSmokeMessage,
  formatConfigurationReport,
  main,
};
