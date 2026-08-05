const {
  sendDiscordMessage,
} = require('./discord');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function isDiscordReportsEnabled(env = process.env) {
  return parseBoolean(env.DISCORD_REPORTS_ENABLED, false);
}

async function sendDiscordReport(text, channel, options = {}) {
  const env = options.env || process.env;
  if (!isDiscordReportsEnabled(env)) {
    return { enabled: false, delivered: false, channel, reason: 'disabled' };
  }

  try {
    const result = await (options.sender || sendDiscordMessage)(text, {
      channel,
      env,
      requireDelivery: true,
      reportHtml: options.reportHtml !== false,
      username: options.username || 'Economic Agent',
    });
    console.log(`[Discord] #${channel} 리포트 전송 완료`);
    return { enabled: true, ...result };
  } catch (err) {
    console.error(`[Discord] #${channel} 리포트 전송 실패: ${err.message}`);
    return { enabled: true, delivered: false, channel, error: err.message };
  }
}

module.exports = {
  parseBoolean,
  isDiscordReportsEnabled,
  sendDiscordReport,
};
