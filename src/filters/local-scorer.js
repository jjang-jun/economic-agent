const KEYWORDS = require('../config/keywords');
const { MIN_SCORE } = require('../utils/config');
const { analyzeArticlesSentiment, isEnglish } = require('./finbert');
const { analyzeDictionarySentiment } = require('./sentiment-dictionary');
const { dedupeArticles } = require('../utils/article-identity');

const TRADABLE_EVENT_KEYWORDS = [
  '잠정실적', '영업실적', '어닝 서프라이즈', '어닝쇼크', '실적 상향', '목표주가 상향', '목표주가 하향',
  '수주', '공급계약', '단일판매', '자사주', '자기주식', '주주환원', '배당',
  '유상증자', '전환사채', '신주인수권부사채', '합병', '분할', '최대주주',
  '거래정지', '상장폐지', '불성실공시',
];

const URGENT_EVENT_KEYWORDS = [
  '속보', '긴급', '폭락', '폭등', '서킷브레이커', '거래정지', '상장폐지',
  '불성실공시', '파산', '디폴트', '전쟁', '침공', '금리 인상', '금리 인하',
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function includesAny(text, keywords) {
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

function getWeightedMatches(text) {
  const matches = [];
  for (const [weight, keywords] of Object.entries(KEYWORDS.weight)) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matches.push({ keyword, weight: Number(weight) || 1 });
      }
    }
  }
  return matches;
}

function classifyEventType(article, text) {
  if (article.disclosure) return 'disclosure';
  if (includesAny(text, ['잠정실적', '영업실적', '어닝', '실적', 'earnings', 'guidance'])) return 'earnings';
  if (includesAny(text, ['수주', '공급계약', '단일판매', 'contract', 'order'])) return 'contract';
  if (includesAny(text, ['금리', 'fomc', 'cpi', 'pce', '환율', 'fed', 'inflation'])) return 'macro';
  if (includesAny(text, ['전쟁', '관세', '제재', '공급망', 'tariff', 'sanction'])) return 'policy_geopolitical';
  if (includesAny(text, ['목표주가', '상향', '하향', 'upgrade', 'downgrade'])) return 'analyst_revision';
  return 'market_news';
}

function buildScoreDetails(article, text, sectors, sentiment, sentimentConfidence) {
  const matches = getWeightedMatches(text);
  const maxWeight = matches.reduce((max, item) => Math.max(max, item.weight), 1);
  const uniqueMatchCount = new Set(matches.map(item => item.keyword.toLowerCase())).size;
  const eventType = classifyEventType(article, text);
  const isTradableEvent = article.disclosure || includesAny(text, TRADABLE_EVENT_KEYWORDS);
  const isUrgentEvent = article.highPriority || includesAny(text, URGENT_EVENT_KEYWORDS);

  const importanceScore = clamp(
    maxWeight
      + Math.min(Math.max(uniqueMatchCount - 1, 0) * 0.2, 0.8)
      + (article.highPriority ? 0.5 : 0)
      + (article.disclosure ? 0.3 : 0),
    1,
    5
  );

  const tradabilityScore = clamp(
    1.5
      + (isTradableEvent ? 1.6 : 0)
      + (sectors.length > 0 ? 0.7 : 0)
      + (article.disclosure?.stockCode ? 0.7 : 0)
      + (eventType === 'macro' ? -0.4 : 0)
      + (eventType === 'market_news' ? -0.2 : 0),
    1,
    5
  );

  const urgencyScore = clamp(
    1.4
      + (isUrgentEvent ? 1.8 : 0)
      + (maxWeight >= 5 ? 0.9 : 0)
      + (article.disclosure ? 0.7 : 0)
      + (sentiment !== 'neutral' && sentimentConfidence >= 0.75 ? 0.4 : 0),
    1,
    5
  );

  const finalScore = clamp(
    (importanceScore * 0.5) + (tradabilityScore * 0.3) + (urgencyScore * 0.2),
    1,
    5
  );

  return {
    score: Math.round(finalScore),
    importanceScore: Number(importanceScore.toFixed(2)),
    tradabilityScore: Number(tradabilityScore.toFixed(2)),
    urgencyScore: Number(urgencyScore.toFixed(2)),
    eventType,
    matchedKeywords: matches
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)
      .map(item => item.keyword),
  };
}

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

    // 1. 감성 분석 (FinBERT 결과가 없으면 키워드 사전 사용)
    let sentiment = article.sentiment;
    let finbertConfidence = article.finbertConfidence || null;
    let sentimentReason = article.sentimentReason || '';
    if (!sentiment) {
      const dictionarySentiment = analyzeDictionarySentiment(text);
      sentiment = dictionarySentiment.sentiment;
      finbertConfidence = dictionarySentiment.confidence;
      sentimentReason = dictionarySentiment.reason;
    }

    // 2. 섹터 분류
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

    // 3. 중요도/매매연결성/긴급도 기반 스코어링
    const scoreDetails = buildScoreDetails(
      article,
      text,
      matchedSectors,
      sentiment,
      finbertConfidence || 0
    );

    return {
      ...article,
      score: scoreDetails.score,
      importanceScore: scoreDetails.importanceScore,
      tradabilityScore: scoreDetails.tradabilityScore,
      urgencyScore: scoreDetails.urgencyScore,
      eventType: scoreDetails.eventType,
      matchedKeywords: scoreDetails.matchedKeywords,
      sentiment,
      finbertConfidence,
      sectors: matchedSectors,
      sentimentReason,
      reason: [
        sentimentReason,
        scoreDetails.matchedKeywords.length > 0 ? `핵심 키워드: ${scoreDetails.matchedKeywords.slice(0, 3).join(', ')}` : '',
        `유형: ${scoreDetails.eventType}`,
      ].filter(Boolean).join(' · '),
      titleKo: '',
    };
  });

  return dedupeArticles(scored)
    .filter(a => a.score >= MIN_SCORE || a.highPriority)
    .sort((a, b) => (
      b.score - a.score
      || (b.urgencyScore || 0) - (a.urgencyScore || 0)
      || (b.tradabilityScore || 0) - (a.tradabilityScore || 0)
      || new Date(b.pubDate || 0) - new Date(a.pubDate || 0)
    ));
}

module.exports = { scoreArticles };
