const { DISCORD_COMMANDS } = require('../src/config/discord-commands');

const DISCORD_API_BASE = 'https://discord.com/api/v10';

function requireDiscordCommandConfig(env = process.env) {
  const token = String(env.DISCORD_BOT_TOKEN || '').trim();
  const applicationId = String(env.DISCORD_APPLICATION_ID || '').trim();
  const guildId = String(env.DISCORD_GUILD_ID || '').trim();
  if (!token) throw new Error('DISCORD_BOT_TOKEN is required');
  if (!/^\d{17,20}$/.test(applicationId)) throw new Error('DISCORD_APPLICATION_ID is required');
  if (!/^\d{17,20}$/.test(guildId)) throw new Error('DISCORD_GUILD_ID is required');
  return { token, applicationId, guildId };
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function syncDiscordCommands(options = {}) {
  const env = options.env || process.env;
  const fetcher = options.fetcher || fetch;
  const apiBase = options.apiBase || DISCORD_API_BASE;
  const { token, applicationId, guildId } = requireDiscordCommandConfig(env);
  const response = await fetcher(
    `${apiBase}/applications/${applicationId}/guilds/${guildId}/commands`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(DISCORD_COMMANDS),
    },
  );
  const body = await readResponse(response);
  if (!response.ok) {
    const detail = typeof body === 'object' ? body?.message : body;
    throw new Error(`Discord command sync failed (${response.status}): ${detail || 'unknown error'}`);
  }
  return {
    synced: Array.isArray(body) ? body.length : DISCORD_COMMANDS.length,
    commands: DISCORD_COMMANDS.map(command => command.name),
  };
}

async function main() {
  const result = await syncDiscordCommands();
  console.log(`[DiscordCommands] ${result.synced}개 guild 명령 동기화: ${result.commands.join(', ')}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[DiscordCommands] 실패: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  requireDiscordCommandConfig,
  syncDiscordCommands,
};
