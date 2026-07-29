/**
 * AI Provider 추상화 레이어
 *
 * 지원 제공자:
 *   - openai     : OpenAI (GPT-5.6 Responses API)
 *   - anthropic  : Anthropic Claude (claude-sonnet 등)
 *   - groq       : Groq (llama, mixtral — 무료 티어 있음)
 *   - ollama     : Ollama 로컬 (llama3 등 — 완전 무료)
 *   - qwen       : Alibaba Cloud Model Studio 국제 리전
 *   - deepseek   : DeepSeek OpenAI 호환 API
 *   - custom     : OpenAI 호환 API (Together, Fireworks 등)
 *
 * 환경 변수:
 *   AI_PROVIDER  = openai | anthropic | groq | ollama | qwen | deepseek | custom
 *   AI_MODEL     = 모델명 (제공자별 기본값 있음)
 *   AI_DIGEST_MODEL / AI_STOCK_MODEL = 작업별 모델 override (선택)
 *   AI_REASONING_EFFORT / AI_DIGEST_REASONING_EFFORT / AI_STOCK_REASONING_EFFORT
 *   AI_VERBOSITY / AI_DIGEST_VERBOSITY / AI_STOCK_VERBOSITY
 *   AI_THINKING_MODE / AI_DIGEST_THINKING_MODE / AI_STOCK_THINKING_MODE
 *   AI_TEMPERATURE = OpenAI 호환 API temperature override (선택)
 *   OPENAI_SAFETY_IDENTIFIER = 개인정보가 아닌 안정적 사용자 식별자 (선택)
 *   AI_API_KEY   = API 키 (ollama는 불필요)
 *   AI_BASE_URL  = 커스텀 엔드포인트 (선택)
 */

const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.6-terra',
    keyEnv: 'OPENAI_API_KEY',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-5',
    keyEnv: 'ANTHROPIC_API_KEY',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyEnv: 'GROQ_API_KEY',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3',
    keyEnv: null,
  },
  qwen: {
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.7-flash',
    keyEnv: 'DASHSCOPE_API_KEY',
    temperature: null,
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    keyEnv: 'DEEPSEEK_API_KEY',
    temperature: null,
  },
  custom: {
    baseUrl: '',
    model: '',
    keyEnv: 'AI_API_KEY',
    temperature: 0.3,
  },
};

const OPENAI_REASONING_EFFORTS = new Set(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
const OPENAI_VERBOSITIES = new Set(['low', 'medium', 'high']);
const COMPATIBLE_THINKING_MODES = new Set(['enabled', 'disabled']);

function getTaskEnv(task, suffix) {
  if (!task) return '';
  const key = `AI_${String(task).toUpperCase()}_${suffix}`;
  return process.env[key] || '';
}

function getConfig(options = {}) {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom;
  const task = options.task || '';

  const temperatureText = String(process.env.AI_TEMPERATURE || '').trim();
  const temperature = temperatureText
    ? Number(temperatureText)
    : (defaults.temperature ?? (['groq', 'ollama'].includes(provider) ? 0.3 : null));

  if (temperatureText && !Number.isFinite(temperature)) {
    throw new Error(`AI_TEMPERATURE 설정이 올바르지 않습니다: ${temperatureText}`);
  }

  return {
    provider,
    model: getTaskEnv(task, 'MODEL') || process.env.AI_MODEL || defaults.model,
    apiKey: (defaults.keyEnv ? process.env[defaults.keyEnv] : '') || process.env.AI_API_KEY || '',
    baseUrl: String(process.env.AI_BASE_URL || defaults.baseUrl).replace(/\/+$/, ''),
    reasoningEffort: getTaskEnv(task, 'REASONING_EFFORT')
      || process.env.AI_REASONING_EFFORT
      || (task === 'stock' ? 'medium' : 'low'),
    verbosity: getTaskEnv(task, 'VERBOSITY')
      || process.env.AI_VERBOSITY
      || (task === 'stock' ? 'medium' : 'low'),
    thinkingMode: getTaskEnv(task, 'THINKING_MODE')
      || process.env.AI_THINKING_MODE
      || (['qwen', 'deepseek'].includes(provider) ? 'disabled' : ''),
    temperature,
    safetyIdentifier: String(process.env.OPENAI_SAFETY_IDENTIFIER || '').trim(),
    task,
  };
}

function assertOpenAIOption(name, value, allowed) {
  if (!allowed.has(value)) {
    throw new Error(`OpenAI ${name} 설정이 올바르지 않습니다: ${value}`);
  }
}

/**
 * AI에 텍스트를 보내고 응답을 받는 통합 함수
 * @param {string} prompt - 사용자 프롬프트
 * @param {object} options - { maxTokens, task, jsonSchema, jsonObject }
 * @returns {string} AI 응답 텍스트
 */
async function chat(prompt, options = {}) {
  const result = await chatDetailed(prompt, options);
  return result.text;
}

async function chatDetailed(prompt, options = {}) {
  const config = getConfig(options);
  const maxTokens = options.maxTokens || 4096;
  const startedAt = Date.now();

  if (
    ['qwen', 'deepseek'].includes(config.provider)
    && !COMPATIBLE_THINKING_MODES.has(config.thinkingMode)
  ) {
    throw new Error(`AI thinking mode 설정이 올바르지 않습니다: ${config.thinkingMode}`);
  }

  let result;

  if (config.provider === 'anthropic') {
    result = await chatAnthropic(config, prompt, maxTokens);
  } else if (config.provider === 'openai') {
    result = await chatOpenAI(config, prompt, maxTokens, options);
  } else {
    result = await chatOpenAICompatible(config, prompt, maxTokens, options);
  }

  return {
    text: result.text,
    metadata: {
      task: config.task || '',
      provider: config.provider,
      requestedModel: config.model,
      model: result.model || config.model,
      reasoningEffort: config.provider === 'openai' ? config.reasoningEffort : null,
      verbosity: config.provider === 'openai' ? config.verbosity : null,
      thinkingMode: ['qwen', 'deepseek'].includes(config.provider) ? config.thinkingMode : null,
      reasoningContext: result.reasoningContext ?? null,
      latencyMs: Date.now() - startedAt,
      inputTokens: result.inputTokens ?? null,
      cachedInputTokens: result.cachedInputTokens ?? null,
      cacheWriteTokens: result.cacheWriteTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      reasoningTokens: result.reasoningTokens ?? null,
      totalTokens: result.totalTokens ?? null,
      finishReason: result.finishReason || '',
      incompleteReason: result.incompleteReason || '',
      responseId: result.responseId || '',
    },
  };
}

// Anthropic Messages API
async function chatAnthropic(config, prompt, maxTokens) {
  const res = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API 오류: ${res.status} ${body}`);
  }

  const data = await res.json();
  return {
    text: data.content?.find(item => item.type === 'text')?.text?.trim() || '',
    model: data.model,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    finishReason: data.stop_reason,
    responseId: data.id,
  };
}

function extractOpenAIResponseText(data = {}) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  return (data.output || [])
    .filter(item => item?.type === 'message')
    .flatMap(item => item.content || [])
    .filter(item => item?.type === 'output_text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('\n')
    .trim();
}

async function chatOpenAI(config, prompt, maxTokens, options = {}) {
  assertOpenAIOption('reasoning effort', config.reasoningEffort, OPENAI_REASONING_EFFORTS);
  assertOpenAIOption('verbosity', config.verbosity, OPENAI_VERBOSITIES);

  const body = {
    model: config.model,
    input: prompt,
    max_output_tokens: maxTokens,
    reasoning: {
      effort: config.reasoningEffort,
    },
    text: {
      verbosity: config.verbosity,
    },
  };

  if (options.jsonSchema) {
    body.text.format = {
      type: 'json_schema',
      name: options.jsonSchema.name,
      strict: true,
      schema: options.jsonSchema.schema,
    };
  } else if (options.jsonObject) {
    body.text.format = { type: 'json_object' };
  }

  if (config.safetyIdentifier) {
    body.safety_identifier = config.safetyIdentifier;
  }

  const res = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.text();
    throw new Error(`OpenAI API 오류: ${res.status} ${responseBody}`);
  }

  const data = await res.json();
  return {
    text: extractOpenAIResponseText(data),
    model: data.model,
    inputTokens: data.usage?.input_tokens,
    cachedInputTokens: data.usage?.input_tokens_details?.cached_tokens,
    cacheWriteTokens: data.usage?.input_tokens_details?.cache_write_tokens,
    outputTokens: data.usage?.output_tokens,
    reasoningTokens: data.usage?.output_tokens_details?.reasoning_tokens,
    totalTokens: data.usage?.total_tokens,
    finishReason: data.status,
    incompleteReason: data.incomplete_details?.reason || '',
    reasoningContext: data.reasoning?.context,
    responseId: data.id,
  };
}

// OpenAI 호환 API (OpenAI, Groq, Ollama, Together 등)
async function chatOpenAICompatible(config, prompt, maxTokens, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const body = {
    model: config.model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };

  if (config.temperature !== null) {
    body.temperature = config.temperature;
  }
  if (options.jsonSchema || options.jsonObject) {
    body.response_format = { type: 'json_object' };
  }
  if (config.provider === 'qwen') {
    body.enable_thinking = config.thinkingMode === 'enabled';
  } else if (config.provider === 'deepseek') {
    body.thinking = { type: config.thinkingMode === 'enabled' ? 'enabled' : 'disabled' };
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI API 오류: ${res.status} ${body}`);
  }

  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content?.trim() || '',
    model: data.model,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    totalTokens: data.usage?.total_tokens,
    finishReason: data.choices?.[0]?.finish_reason,
    responseId: data.id,
  };
}

/**
 * JSON 응답에서 배열 또는 객체를 추출
 */
function extractJSON(text, type = 'array') {
  const open = type === 'array' ? '[' : '{';
  const close = type === 'array' ? ']' : '}';

  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end === -1) {
    throw new Error(`JSON ${type === 'array' ? '배열' : '객체'}을 찾을 수 없습니다`);
  }

  return JSON.parse(text.slice(start, end + 1));
}

module.exports = {
  chat,
  chatDetailed,
  extractJSON,
  extractOpenAIResponseText,
  getConfig,
};
