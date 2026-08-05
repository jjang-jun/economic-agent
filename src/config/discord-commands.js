const DISCORD_APPLICATION_COMMAND_TYPE = 1;
const DISCORD_BOOLEAN_OPTION_TYPE = 5;

const DISCORD_COMMANDS = [
  {
    name: 'portfolio',
    description: '현재 포트폴리오 평가액과 현금·포지션을 조회합니다.',
  },
  {
    name: 'goal',
    description: '경제적 자유 목표의 현재 진행 상태를 조회합니다.',
  },
  {
    name: 'risk',
    description: '현재 포트폴리오와 투자 정책 기준 위험 상태를 조회합니다.',
  },
  {
    name: 'recommendations',
    description: '최근 승인 추천을 조회합니다.',
    options: [
      {
        type: DISCORD_BOOLEAN_OPTION_TYPE,
        name: 'include_blocked',
        description: '차단·관찰 후보도 함께 표시합니다.',
        required: false,
      },
    ],
  },
  {
    name: 'trades',
    description: '최근 실제 거래 기록을 조회합니다.',
  },
  {
    name: 'trade-performance',
    description: '기록된 실제 거래의 현재 성과를 조회합니다.',
  },
].map(command => ({
  type: DISCORD_APPLICATION_COMMAND_TYPE,
  dm_permission: false,
  ...command,
}));

function getDiscordCommandOption(interaction, name) {
  return interaction?.data?.options?.find(option => option.name === name)?.value;
}

function discordInteractionToAgentText(interaction = {}) {
  const name = String(interaction.data?.name || '').toLowerCase();
  if (!DISCORD_COMMANDS.some(command => command.name === name)) return '';
  if (name === 'recommendations' && getDiscordCommandOption(interaction, 'include_blocked') === true) {
    return '/recommendations blocked';
  }
  return `/${name}`;
}

module.exports = {
  DISCORD_COMMANDS,
  discordInteractionToAgentText,
  getDiscordCommandOption,
};
