const crypto = require('crypto');
const { loadPortfolio, enrichPortfolio, loadLatestPortfolioSnapshot } = require('../utils/portfolio');
const { buildFreedomStatus } = require('../utils/freedom-engine');
const strategyPolicy = require('../config/strategy-policy');
const {
  persistConversationMessage,
  loadLatestPersistedPortfolioSnapshot,
} = require('../utils/persistence');
const { loadStoredPortfolio } = require('../utils/portfolio-store');
const {
  formatPortfolioStatus,
  formatGoalStatus,
  formatRiskStatus,
  formatHelp,
} = require('./response-composer');
const { handlePendingActionCallback } = require('./pending-actions');
const { formatRecentRecommendations } = require('./recommendations-view');
const { formatRecentTrades, formatCurrentTradePerformance } = require('./trades-view');
const { discordConversationKey } = require('../config/discord-access');

function normalizeCommand(text = '') {
  const cleaned = String(text || '').trim();
  const command = cleaned.split(/\s+/)[0].toLowerCase();
  return command.replace(/@[\w_]+$/, '');
}

function isPendingActionCommand(command) {
  return ['/buy', '/sell', '/cash'].includes(command);
}

function hasMissingMarketValue(portfolio = {}) {
  return (portfolio.positions || []).some(position => (
    typeof position.marketValue !== 'number' || !Number.isFinite(position.marketValue)
  ));
}

async function getEnrichedPortfolio() {
  const storedPortfolio = await loadStoredPortfolio();
  if (storedPortfolio?.cashAmount !== null || (storedPortfolio?.positions || []).length > 0) {
    const portfolio = await enrichPortfolio(storedPortfolio);
    const missingMarketValues = hasMissingMarketValue(portfolio);
    if (!missingMarketValues) return portfolio;

    const latest = loadLatestPortfolioSnapshot();
    if (latest?.totalAssetValue) return latest;
    const persisted = await loadLatestPersistedPortfolioSnapshot();
    const snapshot = persisted.rows?.[0];
    if (snapshot?.totalAssetValue) return snapshot;
    return portfolio;
  }

  const rawPortfolio = loadPortfolio();
  if (!rawPortfolio.totalAssetValue && !rawPortfolio.cashAmount && (rawPortfolio.positions || []).length === 0) {
    const persisted = await loadLatestPersistedPortfolioSnapshot();
    const snapshot = persisted.rows?.[0];
    if (snapshot?.totalAssetValue) return snapshot;
  }

  const portfolio = await enrichPortfolio(rawPortfolio);
  const missingMarketValues = hasMissingMarketValue(portfolio);
  if (missingMarketValues) {
    const latest = loadLatestPortfolioSnapshot();
    if (latest?.totalAssetValue) return latest;
    const persisted = await loadLatestPersistedPortfolioSnapshot();
    const snapshot = persisted.rows?.[0];
    if (snapshot?.totalAssetValue) return snapshot;
  }
  return portfolio;
}

async function buildResponse(text, options = {}) {
  const allowSensitiveReadOnly = options.allowSensitiveReadOnly === true;
  const command = normalizeCommand(text);
  if (!command || command === '/start' || command === '/help') {
    return { intent: 'help', response: formatHelp() };
  }

  if (command === '/portfolio') {
    const portfolio = await getEnrichedPortfolio();
    return {
      intent: 'portfolio_status',
      response: formatPortfolioStatus(portfolio),
      dataCutoff: { portfolio: portfolio.capturedAt },
    };
  }

  if (command === '/goal') {
    const portfolio = await getEnrichedPortfolio();
    const status = buildFreedomStatus({ portfolio });
    return {
      intent: 'freedom_status',
      response: formatGoalStatus(status),
      dataCutoff: { portfolio: portfolio.capturedAt, freedom: status.generatedAt },
    };
  }

  if (command === '/risk') {
    const portfolio = await getEnrichedPortfolio();
    return {
      intent: 'risk_status',
      response: formatRiskStatus({ portfolio, policy: strategyPolicy }),
      dataCutoff: { portfolio: portfolio.capturedAt },
    };
  }

  if (command === '/pending') {
    return {
      intent: 'pending_actions',
      response: '대기 중인 승인 작업은 허용된 Discord 멘션 채널에서 확인할 수 있습니다.',
    };
  }

  if (command === '/recommendations' || command === '/recs') {
    if (allowSensitiveReadOnly) {
      const includeBlocked = /\b(blocked|watch|all|차단|관찰|전체)\b/i.test(text);
      return {
        intent: 'recent_recommendations',
        response: await formatRecentRecommendations({ limit: 5, includeBlocked }),
      };
    }
    return {
      intent: 'recent_recommendations_requires_chat',
      response: '최근 추천 목록은 허용된 Discord 서버에서만 조회할 수 있습니다.',
    };
  }

  if (command === '/trades' || command === '/executions') {
    if (allowSensitiveReadOnly) {
      return {
        intent: 'recent_trades',
        response: await formatRecentTrades({ limit: 10 }),
      };
    }
    return {
      intent: 'recent_trades_requires_chat',
      response: '최근 실제 거래 기록은 허용된 Discord 서버에서만 조회할 수 있습니다.',
    };
  }

  if (['/trade_performance', '/trade-performance', '/tradeperformance'].includes(command)) {
    if (allowSensitiveReadOnly) {
      return {
        intent: 'trade_performance',
        response: await formatCurrentTradePerformance(),
      };
    }
    return {
      intent: 'trade_performance_requires_chat',
      response: '실제 거래 성과는 허용된 Discord 서버에서만 조회할 수 있습니다.',
    };
  }

  if (isPendingActionCommand(command)) {
    return {
      intent: 'pending_action_requires_chat',
      response: allowSensitiveReadOnly
        ? '거래/현금 변경은 Slash 명령으로 실행하지 않습니다. 허용된 개인 채널에서 봇을 멘션해 자연어 초안을 만든 뒤 승인 버튼을 눌러주세요.'
        : '거래/현금 변경은 허용된 Discord 멘션 채널에서 초안을 만든 뒤 승인 버튼을 눌러주세요.',
    };
  }

  return {
    intent: 'unknown',
    response: formatHelp(),
  };
}

async function routeDiscordReadOnlyCommand(interaction = {}) {
  const { discordInteractionToAgentText } = require('../config/discord-commands');
  const text = discordInteractionToAgentText(interaction);
  const userId = interaction.member?.user?.id || interaction.user?.id || '';
  const channelId = interaction.channel_id || '';
  const guildId = interaction.guild_id || '';
  const result = text
    ? await buildResponse(text, { allowSensitiveReadOnly: true })
    : { intent: 'unknown', response: formatHelp() };

  await persistConversationMessage({
    id: crypto.randomUUID(),
    chatId: `discord:${guildId}:${channelId}`,
    messageId: String(interaction.id || ''),
    direction: 'inbound',
    intent: result.intent,
    text,
    response: result.response,
    dataCutoff: result.dataCutoff || {},
    status: 'answered',
    payload: {
      platform: 'discord',
      applicationId: interaction.application_id || '',
      guildId,
      channelId,
      userId,
      commandName: interaction.data?.name || '',
      options: interaction.data?.options || [],
    },
  });

  return { allowed: true, ...result };
}

async function routeDiscordPendingComponent(interaction = {}) {
  const data = interaction.data?.custom_id || '';
  const userId = interaction.member?.user?.id || interaction.user?.id || '';
  const chatId = discordConversationKey({
    guildId: interaction.guild_id || '',
    channelId: interaction.channel_id || '',
    userId,
  });
  const result = await handlePendingActionCallback(data, { chatId });
  await persistConversationMessage({
    id: crypto.randomUUID(),
    chatId,
    messageId: String(interaction.message?.id || interaction.id || ''),
    direction: 'callback',
    intent: `pending_action_${result.verb}`,
    text: data.split(':')[0],
    response: result.response,
    pendingActionId: result.actionId,
    status: 'answered',
    payload: {
      platform: 'discord_component',
      guildId: interaction.guild_id || '',
      channelId: interaction.channel_id || '',
      userId,
    },
  });
  return { allowed: true, intent: `pending_action_${result.verb}`, response: result.response };
}

module.exports = {
  normalizeCommand,
  buildResponse,
  routeDiscordReadOnlyCommand,
  routeDiscordPendingComponent,
};
