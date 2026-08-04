const { DISCORD_CHANNELS } = require('../src/config/discord-channels');
const {
  inspectDiscordConfiguration,
  sendDiscordMessage,
} = require('../src/notify/discord');

function parseArgs(argv = process.argv.slice(2)) {
  const channelArg = argv.find(arg => arg.startsWith('--channel='));
  return {
    sendTest: argv.includes('--send-test') || argv.includes('--sendTest'),
    channel: channelArg ? channelArg.slice('--channel='.length) : 'ops',
  };
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
  const result = await sendDiscordMessage([
    '🧪 **Economic Agent Discord 연결 점검**',
    `채널: \`#${target.name}\``,
    `시각: ${new Date().toISOString()}`,
    '결과: Webhook 수신 정상',
  ].join('\n'), {
    channel: options.channel,
    requireDelivery: true,
    telegramHtml: false,
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
  formatConfigurationReport,
  main,
};
