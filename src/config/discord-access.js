function splitDiscordIdList(value = '') {
  return [...new Set(String(value || '')
    .split(/[\s,]+/)
    .map(item => item.trim())
    .filter(Boolean))];
}

function getDiscordAccessPolicy(env = process.env) {
  return {
    guildId: String(env.DISCORD_GUILD_ID || ''),
    allowedUserIds: splitDiscordIdList(env.DISCORD_ALLOWED_USER_IDS),
    allowedChannelIds: splitDiscordIdList(env.DISCORD_ALLOWED_CHANNEL_IDS),
  };
}

function discordConversationKey({ guildId = '', channelId = '', userId = '' } = {}) {
  return `discord:${guildId}:${channelId}:${userId}`;
}

function authorizeDiscordContext(context = {}, env = process.env, options = {}) {
  const policy = getDiscordAccessPolicy(env);
  if (!policy.guildId || policy.allowedUserIds.length === 0) {
    return { allowed: false, reason: 'Discord 조회 권한 설정이 완료되지 않았습니다.' };
  }
  if (String(context.guildId || '') !== policy.guildId) {
    return { allowed: false, reason: '허용되지 않은 Discord 서버입니다.' };
  }
  if (!policy.allowedUserIds.includes(String(context.userId || ''))) {
    return { allowed: false, reason: '허용되지 않은 Discord 사용자입니다.' };
  }
  if (options.requireChannelAllowlist && policy.allowedChannelIds.length === 0) {
    return { allowed: false, reason: 'Discord 멘션 허용 채널이 설정되지 않았습니다.' };
  }
  if (policy.allowedChannelIds.length > 0
    && !policy.allowedChannelIds.includes(String(context.channelId || ''))) {
    return { allowed: false, reason: '이 채널에서는 개인 자산 조회를 사용할 수 없습니다.' };
  }
  return { allowed: true };
}

module.exports = {
  authorizeDiscordContext,
  discordConversationKey,
  getDiscordAccessPolicy,
  splitDiscordIdList,
};
