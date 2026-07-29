const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chatDetailed,
  getConfig,
} = require('../src/utils/ai-client');

const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'AI_MODEL',
  'AI_STOCK_MODEL',
  'AI_DIGEST_MODEL',
  'AI_REASONING_EFFORT',
  'AI_STOCK_REASONING_EFFORT',
  'AI_DIGEST_REASONING_EFFORT',
  'AI_VERBOSITY',
  'AI_STOCK_VERBOSITY',
  'AI_DIGEST_VERBOSITY',
  'AI_THINKING_MODE',
  'AI_STOCK_THINKING_MODE',
  'AI_DIGEST_THINKING_MODE',
  'AI_TEMPERATURE',
  'AI_API_KEY',
  'AI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_SAFETY_IDENTIFIER',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'DASHSCOPE_API_KEY',
  'DEEPSEEK_API_KEY',
];

function clearAiEnv() {
  for (const key of AI_ENV_KEYS) delete process.env[key];
}

test('OpenAI uses GPT-5.6 Responses API with task reasoning and structured JSON', async t => {
  const originalFetch = global.fetch;
  const originalEnv = Object.fromEntries(AI_ENV_KEYS.map(key => [key, process.env[key]]));
  t.after(() => {
    global.fetch = originalFetch;
    clearAiEnv();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) process.env[key] = value;
    }
  });

  clearAiEnv();
  process.env.AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let request;
  global.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      id: 'resp_test',
      model: 'gpt-5.6-terra-2026-06-30',
      status: 'completed',
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: '{"ok":' }] },
        { type: 'message', content: [{ type: 'output_text', text: 'true}' }] },
      ],
      usage: {
        input_tokens: 120,
        input_tokens_details: { cached_tokens: 80, cache_write_tokens: 16 },
        output_tokens: 45,
        total_tokens: 165,
        output_tokens_details: { reasoning_tokens: 20 },
      },
      reasoning: { effort: 'medium', context: 'all_turns' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  process.env.OPENAI_SAFETY_IDENTIFIER = 'owner-test-hash';
  const result = await chatDetailed('Return JSON', {
    task: 'stock',
    maxTokens: 1234,
    jsonSchema: {
      name: 'test_result',
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      },
    },
  });

  assert.equal(getConfig({ task: 'stock' }).model, 'gpt-5.6-terra');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.Authorization, 'Bearer test-openai-key');
  assert.equal(request.body.model, 'gpt-5.6-terra');
  assert.equal(request.body.max_output_tokens, 1234);
  assert.deepEqual(request.body.reasoning, { effort: 'medium' });
  assert.equal(request.body.text.verbosity, 'medium');
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.safety_identifier, 'owner-test-hash');
  assert.equal(request.body.max_tokens, undefined);
  assert.equal(request.body.temperature, undefined);
  assert.equal(result.text, '{"ok":\ntrue}');
  assert.equal(result.metadata.model, 'gpt-5.6-terra-2026-06-30');
  assert.equal(result.metadata.verbosity, 'medium');
  assert.equal(result.metadata.reasoningContext, 'all_turns');
  assert.equal(result.metadata.cachedInputTokens, 80);
  assert.equal(result.metadata.cacheWriteTokens, 16);
  assert.equal(result.metadata.reasoningTokens, 20);
  assert.equal(result.metadata.totalTokens, 165);
});

test('OpenAI rejects invalid GPT-5.6 reasoning and verbosity settings before fetch', async t => {
  const originalFetch = global.fetch;
  const originalEnv = Object.fromEntries(AI_ENV_KEYS.map(key => [key, process.env[key]]));
  t.after(() => {
    global.fetch = originalFetch;
    clearAiEnv();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) process.env[key] = value;
    }
  });

  clearAiEnv();
  process.env.AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.AI_REASONING_EFFORT = 'extreme';
  global.fetch = async () => {
    throw new Error('fetch should not be called');
  };

  await assert.rejects(chatDetailed('hello'), /reasoning effort 설정이 올바르지 않습니다/);

  process.env.AI_REASONING_EFFORT = 'low';
  process.env.AI_VERBOSITY = 'verbose';
  await assert.rejects(chatDetailed('hello'), /verbosity 설정이 올바르지 않습니다/);
});

test('Anthropic and OpenAI-compatible providers keep their existing endpoints', async t => {
  const originalFetch = global.fetch;
  const originalEnv = Object.fromEntries(AI_ENV_KEYS.map(key => [key, process.env[key]]));
  t.after(() => {
    global.fetch = originalFetch;
    clearAiEnv();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) process.env[key] = value;
    }
  });

  clearAiEnv();
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (url.endsWith('/v1/messages')) {
      return new Response(JSON.stringify({
        id: 'msg_test',
        model: 'claude-test',
        content: [{ type: 'text', text: 'anthropic' }],
        usage: { input_tokens: 10, output_tokens: 2 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      id: 'chat_test',
      model: 'llama-test',
      choices: [{ finish_reason: 'stop', message: { content: 'groq' } }],
      usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  process.env.AI_PROVIDER = 'anthropic';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  const anthropic = await chatDetailed('hello');

  process.env.AI_PROVIDER = 'groq';
  process.env.GROQ_API_KEY = 'test-groq-key';
  const groq = await chatDetailed('hello');

  assert.equal(requests[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests[0].body.model, 'claude-sonnet-5');
  assert.equal(requests[0].body.max_tokens, 4096);
  assert.equal(anthropic.text, 'anthropic');
  assert.equal(requests[1].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(requests[1].body.max_tokens, 4096);
  assert.equal(groq.text, 'groq');
});

test('Qwen and DeepSeek providers use low-cost defaults, JSON mode, and explicit thinking control', async t => {
  const originalFetch = global.fetch;
  const originalEnv = Object.fromEntries(AI_ENV_KEYS.map(key => [key, process.env[key]]));
  t.after(() => {
    global.fetch = originalFetch;
    clearAiEnv();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) process.env[key] = value;
    }
  });

  clearAiEnv();
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      id: 'chat_cn',
      model: JSON.parse(options.body).model,
      choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  process.env.AI_PROVIDER = 'qwen';
  process.env.DASHSCOPE_API_KEY = 'qwen-key';
  const qwen = await chatDetailed('Return JSON', { task: 'digest', jsonObject: true });

  process.env.AI_PROVIDER = 'deepseek';
  process.env.DEEPSEEK_API_KEY = 'deepseek-key';
  process.env.AI_STOCK_THINKING_MODE = 'enabled';
  const deepseek = await chatDetailed('Return JSON', { task: 'stock', jsonObject: true });

  assert.equal(requests[0].url, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
  assert.equal(requests[0].headers.Authorization, 'Bearer qwen-key');
  assert.equal(requests[0].body.model, 'qwen3.7-flash');
  assert.equal(requests[0].body.enable_thinking, false);
  assert.deepEqual(requests[0].body.response_format, { type: 'json_object' });
  assert.equal(requests[0].body.temperature, undefined);
  assert.equal(qwen.metadata.thinkingMode, 'disabled');

  assert.equal(requests[1].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(requests[1].body.model, 'deepseek-v4-flash');
  assert.deepEqual(requests[1].body.thinking, { type: 'enabled' });
  assert.deepEqual(requests[1].body.response_format, { type: 'json_object' });
  assert.equal(requests[1].body.temperature, undefined);
  assert.equal(deepseek.metadata.thinkingMode, 'enabled');
});
