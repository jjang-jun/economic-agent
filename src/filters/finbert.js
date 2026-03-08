/**
 * FinBERT 금융 감성 분석 (영문 기사 전용)
 * 모델: Xenova/finbert (ProsusAI/finbert ONNX 변환)
 * 비용: 무료 (로컬 CPU 추론)
 * 첫 실행 시 ~110MB 모델 다운로드, 이후 캐시
 */

const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', '.cache');
const MODEL_NAME = 'Xenova/finbert';

// FinBERT 라벨 → 프로젝트 감성 매핑
const LABEL_MAP = {
  positive: 'bullish',
  negative: 'bearish',
  neutral: 'neutral',
};

let classifier = null;

async function getClassifier() {
  if (classifier) return classifier;

  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = CACHE_DIR;

  console.log('[FinBERT] 모델 로딩 중...');
  classifier = await pipeline('text-classification', MODEL_NAME, {
    dtype: 'q8',
  });
  console.log('[FinBERT] 모델 로딩 완료');

  return classifier;
}

/**
 * 영문 텍스트의 금융 감성 분석
 * @param {string} text - 영문 텍스트
 * @returns {{ sentiment: string, confidence: number }}
 */
async function analyzeSentiment(text) {
  const clf = await getClassifier();
  const result = await clf(text, { truncation: true });
  const top = result[0];

  return {
    sentiment: LABEL_MAP[top.label] || 'neutral',
    confidence: top.score,
  };
}

/**
 * 여러 기사의 감성을 일괄 분석
 * @param {Array} articles - 기사 배열
 * @returns {Array} 감성이 추가된 기사 배열
 */
async function analyzeArticlesSentiment(articles) {
  if (articles.length === 0) return articles;

  const clf = await getClassifier();
  const texts = articles.map(a => a.title);
  const results = await clf(texts, { truncation: true });

  return articles.map((article, i) => {
    const result = Array.isArray(results[i]) ? results[i][0] : results[i];
    return {
      ...article,
      sentiment: LABEL_MAP[result.label] || 'neutral',
      finbertConfidence: result.score,
    };
  });
}

/**
 * 텍스트가 영문인지 판별 (간단한 ASCII 비율 체크)
 */
function isEnglish(text) {
  const ascii = text.replace(/[^a-zA-Z]/g, '').length;
  return ascii / text.length > 0.5;
}

module.exports = { analyzeSentiment, analyzeArticlesSentiment, isEnglish };
