const test = require('node:test');
const assert = require('node:assert/strict');
const {
  expertConversationKey,
  expertRequestTimeoutMs,
  formatExpertTeamResponse,
  routeExpertTeamRequest,
} = require('../src/agent/expert-team');
const { classifyExpertRequest } = require('../src/config/expert-roles');

test('expert team uses isolated primary and reviewer contexts with separate token budgets', async () => {
  const assignment = classifyExpertRequest('삼성전자 추가 매수를 검토해줘', { maxReviewers: 1 });
  const calls = [];
  const result = await routeExpertTeamRequest('삼성전자 추가 매수를 검토해줘', {
    env: { AI_EXPERT_MAX_TOKENS: '600', AI_EXPERT_REVIEW_MAX_TOKENS: '220' },
    assignment,
    contextLoader: async roleId => ({
      contextText: `ONLY_CONTEXT_FOR_${roleId}`,
      dataCutoff: { roleId },
    }),
    aiChat: async (prompt, options) => {
      calls.push({ prompt, options });
      return options.task === 'expert'
        ? { text: '조건부 분할 매수 검토입니다.', metadata: { totalTokens: 120 } }
        : { text: '손절 조건을 먼저 확정하세요.', metadata: { totalTokens: 40 } };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.maxTokens, 600);
  assert.equal(calls[1].options.maxTokens, 220);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.ok(calls[1].options.signal instanceof AbortSignal);
  assert.match(calls[0].prompt, /ONLY_CONTEXT_FOR_investment/);
  assert.doesNotMatch(calls[0].prompt, /ONLY_CONTEXT_FOR_risk_manager/);
  assert.match(calls[1].prompt, /ONLY_CONTEXT_FOR_risk_manager/);
  assert.match(calls[1].prompt, /조건부 분할 매수 검토입니다/);
  assert.equal(result.team.to, 'investment');
  assert.deepEqual(result.team.cc, ['risk_manager']);
  assert.match(result.response, /to: \*\*투자 전문가\*\*/);
  assert.match(result.response, /독립 검토/);
  assert.deepEqual(result.agentRuns.map(run => run.metadata.totalTokens), [120, 40]);
});

test('expert request timeout is bounded for an always-on Discord worker', () => {
  assert.equal(expertRequestTimeoutMs({}), 45_000);
  assert.equal(expertRequestTimeoutMs({ DISCORD_EXPERT_TIMEOUT_MS: '1000' }), 5_000);
  assert.equal(expertRequestTimeoutMs({ DISCORD_EXPERT_TIMEOUT_MS: '999999' }), 120_000);
});

test('reviewer failure does not discard a completed primary answer', async () => {
  const assignment = classifyExpertRequest('아파트를 매입해도 될까?', { maxReviewers: 1 });
  let call = 0;
  const result = await routeExpertTeamRequest('아파트를 매입해도 될까?', {
    env: {},
    assignment,
    contextLoader: async roleId => ({ contextText: roleId, dataCutoff: {} }),
    aiChat: async () => {
      call += 1;
      if (call === 1) return { text: '현금흐름 확인이 우선입니다.', metadata: {} };
      throw new Error('review unavailable');
    },
  });
  assert.equal(result.intent, 'expert_real_estate');
  assert.match(result.response, /현금흐름 확인이 우선/);
  assert.match(result.response, /검토자 1명의 응답/);
  assert.equal(result.agentRuns[1].status, 'failed');
});

test('expert response formatting stays within a single Discord message', () => {
  const assignment = classifyExpertRequest('아파트 매입을 검토해줘', { maxReviewers: 2 });
  const response = formatExpertTeamResponse(assignment, '가'.repeat(2_000), assignment.reviewers.map(role => ({
    role,
    status: 'answered',
    text: '나'.repeat(1_000),
  })));
  assert.ok(response.length <= 1_950);
  assert.equal(expertConversationKey('discord:g:c:u', 'investment'), 'discord:g:c:u:expert:investment');
});
