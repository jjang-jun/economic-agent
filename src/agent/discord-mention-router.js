const crypto = require('crypto');
const { buildResponse } = require('./agent-router');
const { createPendingAction } = require('./pending-actions');
const {
  loadNaturalActionInstruments,
  looksLikeNaturalPortfolioAction,
  parseNaturalPortfolioAction,
  parseNaturalReadOnlyQuery,
  stripDiscordMentions,
} = require('./natural-action-parser');
const { persistConversationMessage } = require('../utils/persistence');
const { discordConversationKey } = require('../config/discord-access');
const { classifyExpertRequest } = require('../config/expert-roles');
const {
  expertConversationKey,
  expertResponsesEnabled,
  expertReviewerLimit,
  routeExpertTeamRequest,
} = require('./expert-team');

function discordPendingComponents(action = {}) {
  const id = action.id || '';
  const token = action.confirmationToken || action.confirmation_token || '';
  return [{
    type: 1,
    components: [
      {
        type: 2,
        style: 3,
        label: '기록하기',
        custom_id: `confirm:${id}:${token}`,
      },
      {
        type: 2,
        style: 2,
        label: '취소',
        custom_id: `cancel:${id}:${token}`,
      },
    ],
  }];
}

function mentionActionsEnabled(env = process.env) {
  return ['1', 'true', 'yes', 'on'].includes(String(env.DISCORD_MENTION_ACTIONS_ENABLED || '').toLowerCase());
}

function naturalMentionHelp() {
  return [
    '경제·자산 조회, 전문가 분석 또는 체결 기록을 자연어로 요청할 수 있습니다.',
    '예: `@Economic Agent 내 포트폴리오 상태 알려줘`',
    '예: `@Economic Agent 부동산 전문가에게 내집마련 예산을 검토해줘`',
    '예: `@Economic Agent to: 투자 전문가 cc: 리스크 관리자 삼성전자 추가 매수를 검토해줘`',
    '예: `@Economic Agent 삼성전자 3주를 7만원에 샀어`',
    '예: `@Economic Agent 삼성전자(005930) 2주를 8만원에 팔았어`',
    '예: `@Economic Agent 현금 잔액은 500만원이야`',
    '',
    '거래·현금 변경은 초안만 만들고 `기록하기` 버튼을 눌러야 반영됩니다.',
  ].join('\n');
}

async function persistExpertRuns(result, context, persister) {
  for (const run of result.agentRuns || []) {
    await persister({
      id: crypto.randomUUID(),
      chatId: expertConversationKey(context.chatId, run.role.id),
      messageId: context.messageId,
      direction: 'agent',
      intent: `expert_${run.kind}_${run.role.id}`,
      text: context.text,
      response: run.text || '',
      tools: run.contextScopes || [],
      dataCutoff: run.dataCutoff || {},
      status: run.status || 'answered',
      payload: {
        platform: 'discord_gateway',
        guildId: context.guildId,
        channelId: context.channelId,
        userId: context.userId,
        coordinator: result.team?.coordinator || 'chief_of_staff',
        roleId: run.role.id,
        roleName: run.role.name,
        runKind: run.kind,
        aiMetadata: run.metadata || {},
        errorType: run.errorType || '',
      },
    });
  }
}

async function routeDiscordMention(message = {}, options = {}) {
  const env = options.env || process.env;
  const rawText = stripDiscordMentions(message.content || '');
  const guildId = String(message.guild_id || '');
  const channelId = String(message.channel_id || '');
  const userId = String(message.author?.id || '');
  const chatId = discordConversationKey({ guildId, channelId, userId });
  const instrumentLoader = options.instrumentLoader || loadNaturalActionInstruments;
  const actionCreator = options.actionCreator || createPendingAction;
  const responseBuilder = options.responseBuilder || buildResponse;
  const persister = options.persister || persistConversationMessage;
  const expertRouter = options.expertRouter || routeExpertTeamRequest;

  const instruments = looksLikeNaturalPortfolioAction(rawText) ? await instrumentLoader() : [];
  const naturalAction = parseNaturalPortfolioAction(rawText, { instruments });
  let result;
  let components = [];

  if (naturalAction?.kind === 'clarification') {
    result = { intent: 'natural_action_clarification', response: naturalAction.response };
  } else if (naturalAction?.kind === 'action') {
    if (!mentionActionsEnabled(env)) {
      result = {
        intent: 'discord_mention_actions_disabled',
        response: 'Discord 자연어 거래 초안이 아직 비활성입니다. `DISCORD_MENTION_ACTIONS_ENABLED=true` 설정 후 사용할 수 있습니다.',
      };
    } else {
      const draft = await actionCreator({
        chatId,
        text: naturalAction.command,
        source: 'discord-mention-agent',
      });
      result = {
        intent: `draft_${naturalAction.action}`,
        response: draft.response,
        pendingActionId: draft.action.id,
      };
      components = discordPendingComponents(draft.action);
    }
  } else {
    const command = parseNaturalReadOnlyQuery(rawText);
    const assignment = classifyExpertRequest(rawText, { maxReviewers: expertReviewerLimit(env) });
    const explicitlyAssigned = assignment?.source === 'explicit_to' || assignment?.source === 'explicit_role';
    if (command && !explicitlyAssigned) {
      result = await responseBuilder(command, { allowSensitiveReadOnly: true });
    } else {
      if (!assignment) {
        result = { intent: 'natural_help', response: naturalMentionHelp() };
      } else if (!expertResponsesEnabled(env)) {
        result = {
          intent: 'discord_expert_responses_disabled',
          response: `${assignment.primary.name}에게 배정할 수 있지만 AI 전문가 응답이 아직 비활성입니다. \`DISCORD_EXPERT_RESPONSES_ENABLED=true\` 설정 후 사용할 수 있습니다.`,
          assignment,
          team: {
            coordinator: assignment.coordinator,
            to: assignment.primary.id,
            cc: assignment.reviewers.map(role => role.id),
          },
        };
      } else {
        result = await expertRouter(rawText, { env, assignment });
      }
    }
  }

  await persister({
    id: crypto.randomUUID(),
    chatId,
    messageId: String(message.id || ''),
    direction: 'inbound',
    intent: result.intent,
    text: rawText,
    response: result.response,
    dataCutoff: result.dataCutoff || {},
    pendingActionId: result.pendingActionId || null,
    status: 'answered',
    payload: {
      platform: 'discord_gateway',
      guildId,
      channelId,
      userId,
      expertTeam: result.team || null,
    },
  });

  await persistExpertRuns(result, {
    chatId,
    messageId: String(message.id || ''),
    text: rawText,
    guildId,
    channelId,
    userId,
  }, persister);

  return { ...result, components, chatId };
}

module.exports = {
  discordConversationKey,
  discordPendingComponents,
  mentionActionsEnabled,
  naturalMentionHelp,
  persistExpertRuns,
  routeDiscordMention,
};
