/**
 * AI Provider 추상화 레이어
 *
 * 지원 제공자:
 *   - openai     : OpenAI (gpt-4o-mini 등)
 *   - anthropic  : Anthropic Claude (claude-sonnet 등)
 *   - groq       : Groq (llama, mixtral — 무료 티어 있음)
 *   - ollama     : Ollama 로컬 (llama3 등 — 완전 무료)
 *   - custom     : OpenAI 호환 API (Together, Fireworks 등)
 *
 * 환경 변수:
 *   AI_PROVIDER  = openai | anthropic | groq | ollama | custom
 *   AI_MODEL     = 모델명 (제공자별 기본값 있음)
 *   AI_API_KEY   = API 키 (ollama는 불필요)
 *   AI_BASE_URL  = 커스텀 엔드포인트 (선택)
 */

const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
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
  custom: {
    baseUrl: '',
    model: '',
    keyEnv: 'AI_API_KEY',
  },
};

function getConfig() {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom;

  return {
    provider,
    model: process.env.AI_MODEL || defaults.model,
    apiKey: process.env.AI_API_KEY || (defaults.keyEnv ? process.env[defaults.keyEnv] : ''),
    baseUrl: process.env.AI_BASE_URL || defaults.baseUrl,
  };
}

/**
 * AI에 텍스트를 보내고 응답을 받는 통합 함수
 * @param {string} prompt - 사용자 프롬프트
 * @param {object} options - { maxTokens }
 * @returns {string} AI 응답 텍스트
 */
async function chat(prompt, options = {}) {
  const config = getConfig();
  const maxTokens = options.maxTokens || 4096;

  if (config.provider === 'anthropic') {
    return chatAnthropic(config, prompt, maxTokens);
  }
  return chatOpenAICompatible(config, prompt, maxTokens);
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
  return data.content?.[0]?.text?.trim() || '';
}

// OpenAI 호환 API (OpenAI, Groq, Ollama, Together 등)
async function chatOpenAICompatible(config, prompt, maxTokens) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI API 오류: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
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

module.exports = { chat, extractJSON, getConfig };
