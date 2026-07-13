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
  'AI_API_KEY',
  'AI_BASE_URL',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
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
        output_tokens: 45,
        total_tokens: 165,
        output_tokens_details: { reasoning_tokens: 20 },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

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
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.max_tokens, undefined);
  assert.equal(request.body.temperature, undefined);
  assert.equal(result.text, '{"ok":\ntrue}');
  assert.equal(result.metadata.model, 'gpt-5.6-terra-2026-06-30');
  assert.equal(result.metadata.reasoningTokens, 20);
  assert.equal(result.metadata.totalTokens, 165);
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
