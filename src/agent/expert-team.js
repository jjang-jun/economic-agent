const { chatDetailed } = require('../utils/ai-client');
const { buildExpertContext } = require('./expert-context');
const { classifyExpertRequest, clampReviewerCount } = require('../config/expert-roles');

const DEFAULT_PRIMARY_MAX_TOKENS = 550;
const DEFAULT_REVIEW_MAX_TOKENS = 220;
const DEFAULT_EXPERT_TIMEOUT_MS = 30_000;

function enabledFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function expertResponsesEnabled(env = process.env) {
  return enabledFlag(env.DISCORD_EXPERT_RESPONSES_ENABLED);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function expertReviewerLimit(env = process.env) {
  return clampReviewerCount(env.DISCORD_EXPERT_MAX_REVIEWERS, 1);
}

function expertRequestTimeoutMs(env = process.env) {
  return boundedInteger(
    env.DISCORD_EXPERT_TIMEOUT_MS,
    DEFAULT_EXPERT_TIMEOUT_MS,
    5_000,
    120_000
  );
}

function expertConversationKey(chatId, roleId) {
  return `${String(chatId || '')}:expert:${roleId}`;
}

function buildPrimaryPrompt({ request, role, contextText }) {
  return [
    `당신은 개인 AI 경제 사무실의 ${role.name}다.`,
    `임무: ${role.mission}`,
    '',
    '운영 규율:',
    '- 현재 개인 수치·정책 상태는 제공된 SSoT 컨텍스트만 근거로 사용한다.',
    '- 컨텍스트에 없는 최신 가격·법률·세율은 추측하지 말고 확인 필요라고 명시한다.',
    '- 정부안·추진안·입법예고와 확정·공포·시행을 구분한다.',
    '- 매수·매도·계약을 대신 실행하지 않는다. 가능한 선택지, 무효화 조건, 다음 확인 항목을 제시한다.',
    '- 사실과 해석을 구분하고, 사용 가능한 데이터의 기준 시점이나 공백을 짧게 밝힌다.',
    '- 한국어로 결론부터 답하고 900자 이내로 작성한다.',
    '',
    `사용자 요청: ${request}`,
    '',
    '역할별 SSoT 컨텍스트:',
    contextText,
  ].join('\n');
}

function buildReviewPrompt({ request, primaryRole, primaryAnswer, reviewer, contextText }) {
  return [
    `당신은 개인 AI 경제 사무실의 독립 검토자인 ${reviewer.name}다.`,
    `검토 임무: ${reviewer.mission}`,
    '',
    '다른 전문가의 결론을 반복하지 말고 다음만 점검한다:',
    '- 빠진 반대 근거, 손실·세금·유동성·데이터 리스크',
    '- 사실/추론 혼동, 기준 시점 누락, 확정되지 않은 정책의 과장',
    '- 사용자가 결정 전에 확인할 핵심 항목',
    '- 중대한 이견이 없으면 "중대한 이견 없음"이라고 명시한다.',
    '- 한국어 280자 이내, 최대 3개 항목으로 작성한다.',
    '',
    `사용자 요청: ${request}`,
    `주 담당: ${primaryRole.name}`,
    `주 담당 답변: ${primaryAnswer}`,
    '',
    '검토자 전용 SSoT 컨텍스트:',
    contextText,
  ].join('\n');
}

function clipAnswer(value = '', maxChars = 900) {
  const text = String(value || '').trim();
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function formatExpertTeamResponse(assignment, primaryAnswer, reviews = []) {
  const cc = assignment.reviewers.length > 0
    ? assignment.reviewers.map(role => role.name).join(', ')
    : '없음';
  const parts = [
    '**담당 배정**',
    `to: **${assignment.primary.name}**`,
    `cc: ${cc}`,
    '',
    `**${assignment.primary.name}**`,
    clipAnswer(primaryAnswer, 1_050),
  ];
  const completed = reviews.filter(review => review.status === 'answered');
  if (completed.length > 0) {
    parts.push('', '**독립 검토**');
    for (const review of completed) {
      parts.push(`- **${review.role.name}**: ${clipAnswer(review.text, 300)}`);
    }
  }
  const failedCount = reviews.length - completed.length;
  if (failedCount > 0) parts.push('', `⚠️ 검토자 ${failedCount}명의 응답을 받지 못했습니다.`);
  return clipAnswer(parts.join('\n'), 1_950);
}

async function routeExpertTeamRequest(text = '', options = {}) {
  const env = options.env || process.env;
  const assignment = options.assignment || classifyExpertRequest(text, {
    maxReviewers: expertReviewerLimit(env),
  });
  if (!assignment) return null;
  const contextLoader = options.contextLoader || buildExpertContext;
  const aiChat = options.aiChat || chatDetailed;
  const primaryMaxTokens = boundedInteger(
    env.AI_EXPERT_MAX_TOKENS,
    DEFAULT_PRIMARY_MAX_TOKENS,
    200,
    1_500
  );
  const reviewMaxTokens = boundedInteger(
    env.AI_EXPERT_REVIEW_MAX_TOKENS,
    DEFAULT_REVIEW_MAX_TOKENS,
    100,
    600
  );
  const requestTimeoutMs = expertRequestTimeoutMs(env);

  let primaryContext;
  let primaryResult;
  try {
    primaryContext = await contextLoader(assignment.primary.id, { env, request: text });
    primaryResult = await aiChat(buildPrimaryPrompt({
      request: text,
      role: assignment.primary,
      contextText: primaryContext.contextText,
    }), {
      task: 'expert',
      maxTokens: primaryMaxTokens,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!primaryResult?.text?.trim()) throw new Error('empty expert response');
  } catch (err) {
    return {
      intent: 'expert_team_error',
      response: `${assignment.primary.name} 분석을 완료하지 못했습니다. 잠시 후 다시 요청하거나 기존 조회 명령으로 현재 데이터를 먼저 확인해주세요.`,
      assignment,
      team: {
        coordinator: assignment.coordinator,
        to: assignment.primary.id,
        cc: assignment.reviewers.map(role => role.id),
      },
      agentRuns: [{
        role: assignment.primary,
        kind: 'primary',
        status: 'failed',
        text: '',
        metadata: {},
        dataCutoff: primaryContext?.dataCutoff || {},
        errorType: err.name || 'Error',
      }],
      dataCutoff: primaryContext?.dataCutoff || {},
    };
  }

  const primaryAnswer = primaryResult.text.trim();
  const reviewRuns = await Promise.all(assignment.reviewers.map(async reviewer => {
    let reviewerContext;
    try {
      reviewerContext = await contextLoader(reviewer.id, { env, request: text });
      const reviewed = await aiChat(buildReviewPrompt({
        request: text,
        primaryRole: assignment.primary,
        primaryAnswer,
        reviewer,
        contextText: reviewerContext.contextText,
      }), {
        task: 'expert_review',
        maxTokens: reviewMaxTokens,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (!reviewed?.text?.trim()) throw new Error('empty review response');
      return {
        role: reviewer,
        kind: 'reviewer',
        status: 'answered',
        text: reviewed.text.trim(),
        metadata: reviewed.metadata || {},
        dataCutoff: reviewerContext.dataCutoff || {},
        contextScopes: reviewer.contextScopes,
      };
    } catch (err) {
      return {
        role: reviewer,
        kind: 'reviewer',
        status: 'failed',
        text: '',
        metadata: {},
        dataCutoff: reviewerContext?.dataCutoff || {},
        contextScopes: reviewer.contextScopes,
        errorType: err.name || 'Error',
      };
    }
  }));

  const primaryRun = {
    role: assignment.primary,
    kind: 'primary',
    status: 'answered',
    text: primaryAnswer,
    metadata: primaryResult.metadata || {},
    dataCutoff: primaryContext.dataCutoff || {},
    contextScopes: assignment.primary.contextScopes,
  };
  return {
    intent: `expert_${assignment.primary.id}`,
    response: formatExpertTeamResponse(assignment, primaryAnswer, reviewRuns),
    assignment,
    team: {
      coordinator: assignment.coordinator,
      to: assignment.primary.id,
      cc: assignment.reviewers.map(role => role.id),
    },
    agentRuns: [primaryRun, ...reviewRuns],
    dataCutoff: {
      [assignment.primary.id]: primaryRun.dataCutoff,
      ...Object.fromEntries(reviewRuns.map(run => [run.role.id, run.dataCutoff])),
    },
  };
}

module.exports = {
  DEFAULT_EXPERT_TIMEOUT_MS,
  DEFAULT_PRIMARY_MAX_TOKENS,
  DEFAULT_REVIEW_MAX_TOKENS,
  buildPrimaryPrompt,
  buildReviewPrompt,
  clipAnswer,
  enabledFlag,
  expertConversationKey,
  expertRequestTimeoutMs,
  expertResponsesEnabled,
  expertReviewerLimit,
  formatExpertTeamResponse,
  routeExpertTeamRequest,
};
