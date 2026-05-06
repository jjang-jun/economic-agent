const KEYWORDS = require('../config/keywords');
const { MIN_SCORE } = require('../utils/config');
const { analyzeArticlesSentiment, isEnglish } = require('./finbert');
const { analyzeDictionarySentiment } = require('./sentiment-dictionary');

/**
 * 로컬 스코어링 (AI API 비용 0원)
 * - 중요도: 키워드 가중치
 * - 감성: 영문 → FinBERT (ML 모델), 한국어 → 키워드 사전
 * - 섹터: 키워드 매칭
 */
async function scoreArticles(articles) {
  if (articles.length === 0) return [];

  // 영문/한국어 분리
  const englishArticles = [];
  const koreanArticles = [];

  for (const article of articles) {
    if (isEnglish(article.title)) {
      englishArticles.push(article);
    } else {
      koreanArticles.push(article);
    }
  }

  // 영문 기사: FinBERT 감성 분석
  let finbertResults = [];
  if (englishArticles.length > 0) {
    try {
      console.log(`[FinBERT] 영문 기사 ${englishArticles.length}건 감성 분석 중...`);
      finbertResults = await analyzeArticlesSentiment(englishArticles);
      console.log(`[FinBERT] 분석 완료`);
    } catch (err) {
      console.error(`[FinBERT] 분석 실패, 키워드 사전으로 대체: ${err.message}`);
      finbertResults = englishArticles.map(a => ({ ...a, sentiment: null }));
    }
  }

  // 전체 기사 스코어링
  const allArticles = [...koreanArticles, ...finbertResults];
  const scored = allArticles.map(article => {
    const text = `${article.title} ${article.summary || ''}`.toLowerCase();

    // 1. 중요도 점수: 매칭된 키워드 중 최고 가중치
    let score = 1;
    for (const [weight, keywords] of Object.entries(KEYWORDS.weight)) {
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) {
          score = Math.max(score, parseInt(weight));
        }
      }
    }
    if (article.highPriority) score = 5;

    // 2. 감성 분석 (FinBERT 결과가 없으면 키워드 사전 사용)
    let sentiment = article.sentiment;
    let finbertConfidence = article.finbertConfidence || null;
    let sentimentReason = article.sentimentReason || '';
    if (!sentiment) {
      const dictionarySentiment = analyzeDictionarySentiment(text);
      sentiment = dictionarySentiment.sentiment;
      finbertConfidence = dictionarySentiment.confidence;
      sentimentReason = dictionarySentiment.reason;
    }

    // 3. 섹터 분류
    const matchedSectors = [];
    for (const [sector, keywords] of Object.entries(KEYWORDS.sectors)) {
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) {
          if (!matchedSectors.includes(sector)) {
            matchedSectors.push(sector);
          }
          break;
        }
      }
    }

    return {
      ...article,
      score,
      sentiment,
      finbertConfidence,
      sectors: matchedSectors,
      sentimentReason,
      reason: sentimentReason,
      titleKo: '',
    };
  });

  return scored.filter(a => a.score >= MIN_SCORE || a.highPriority);
}

module.exports = { scoreArticles };
