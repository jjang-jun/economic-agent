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

async function sendDiscordCopy(text, channel, options = {}) {
  const env = options.env || process.env;
  if (!isDiscordReportsEnabled(env)) {
    return { enabled: false, delivered: false, channel, reason: 'disabled' };
  }

  try {
    const result = await (options.sender || sendDiscordMessage)(text, {
      channel,
      env,
      requireDelivery: true,
      telegramHtml: options.telegramHtml !== false,
      username: options.username || 'Economic Agent',
    });
    console.log(`[Discord] #${channel} 병행 전송 완료`);
    return { enabled: true, ...result };
  } catch (err) {
    // 마이그레이션 중 Discord 장애가 Telegram 성공과 버퍼 처리를 막지 않게 격리한다.
    console.error(`[Discord] #${channel} 병행 전송 실패: ${err.message}`);
    return { enabled: true, delivered: false, channel, error: err.message };
  }
}

module.exports = {
  parseBoolean,
  isDiscordReportsEnabled,
  sendDiscordCopy,
};
