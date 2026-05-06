const KEYWORDS = require('../config/keywords');

const STRONG_BULLISH = [
  '자기주식 소각',
  '자기주식 취득',
  '자사주 소각',
  '자사주 취득',
  '주주환원',
  '어닝 서프라이즈',
  '흑자전환',
  '공급계약',
  '대규모 공급계약',
  '목표주가 상향',
  '실적 상향',
];

const STRONG_BEARISH = [
  '유상증자',
  '전환사채',
  '신주인수권부사채',
  '불성실공시',
  '거래정지',
  '상장폐지',
  '감사의견 거절',
  '횡령',
  '배임',
  '적자전환',
  '어닝쇼크',
  '목표주가 하향',
];

function normalize(text) {
  return String(text || '').toLowerCase();
}

function keywordWeight(keyword) {
  const lengthBonus = Math.min(String(keyword).length / 8, 2);
  const phraseBonus = String(keyword).includes(' ') ? 0.5 : 0;
  return 1 + lengthBonus + phraseBonus;
}

function findMatches(text, keywords) {
  const lower = normalize(text);
  return keywords
    .filter(keyword => lower.includes(normalize(keyword)))
    .map(keyword => ({
      keyword,
      weight: keywordWeight(keyword),
    }));
}

function addStrongSignal(matches, text, keywords, extraWeight) {
  const lower = normalize(text);
  for (const keyword of keywords) {
    if (lower.includes(normalize(keyword))) {
      const existing = matches.find(item => normalize(item.keyword) === normalize(keyword));
      if (existing) {
        existing.weight += extraWeight;
      } else {
        matches.push({ keyword, weight: keywordWeight(keyword) + extraWeight });
      }
    }
  }
}

function analyzeDictionarySentiment(text) {
  const bullishMatches = findMatches(text, KEYWORDS.sentiment.bullish);
  const bearishMatches = findMatches(text, KEYWORDS.sentiment.bearish);
  addStrongSignal(bullishMatches, text, STRONG_BULLISH, 3);
  addStrongSignal(bearishMatches, text, STRONG_BEARISH, 3);

  const bullishScore = bullishMatches.reduce((sum, item) => sum + item.weight, 0);
  const bearishScore = bearishMatches.reduce((sum, item) => sum + item.weight, 0);
  const total = bullishScore + bearishScore;
  const diff = bullishScore - bearishScore;

  let sentiment = 'neutral';
  if (total > 0 && Math.abs(diff) >= 1) {
    sentiment = diff > 0 ? 'bullish' : 'bearish';
  }

  const confidence = total > 0
    ? Math.min(0.55 + (Math.abs(diff) / total) * 0.25 + Math.min(total, 10) * 0.02, 0.95)
    : null;
  const dominantMatches = sentiment === 'bullish'
    ? bullishMatches
    : sentiment === 'bearish'
      ? bearishMatches
      : [...bullishMatches, ...bearishMatches];
  const topMatches = dominantMatches
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(item => item.keyword);

  return {
    sentiment,
    confidence,
    bullishScore: Number(bullishScore.toFixed(2)),
    bearishScore: Number(bearishScore.toFixed(2)),
    matches: {
      bullish: bullishMatches.map(item => item.keyword),
      bearish: bearishMatches.map(item => item.keyword),
    },
    reason: topMatches.length > 0 ? `감성 키워드: ${topMatches.join(', ')}` : '',
  };
}

module.exports = {
  analyzeDictionarySentiment,
  STRONG_BULLISH,
  STRONG_BEARISH,
};
