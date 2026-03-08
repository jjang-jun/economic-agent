const { chat, extractJSON } = require('../utils/ai-client');

const DIGEST_NAMES = {
  morning: '아침 브리핑',
  lunch: '점심 브리핑',
  close: '장 마감 브리핑',
  evening: '저녁 브리핑',
  night: '마감 브리핑',
};

async function generateDigest(articles, indicators, session) {
  if (articles.length === 0) return null;

  const sessionName = DIGEST_NAMES[session] || session;

  const articleSummaries = articles
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((a, i) => {
      const sentiment = a.sentiment || 'neutral';
      const sectors = (a.sectors || []).join(', ');
      const title = a.titleKo || a.title;
      return `[${i}] (${sentiment}) [${sectors}] ${title}`;
    })
    .join('\n');

  const indicatorInfo = [];
  if (indicators.baseRate) indicatorInfo.push(`Korea base rate: ${indicators.baseRate}%`);
  if (indicators.fedRate) indicatorInfo.push(`US Fed rate: ${indicators.fedRate}%`);
  if (indicators.cpi) indicatorInfo.push(`US CPI: ${indicators.cpi}`);
  if (indicators.unemployment) indicatorInfo.push(`US unemployment: ${indicators.unemployment}%`);

  const prompt = `You are a financial news editor creating a "${sessionName}" digest for a Korean investor.
Summarize the following news articles into a concise briefing.

## Economic Indicators
${indicatorInfo.length > 0 ? indicatorInfo.join('\n') : '(No data)'}

## Articles (${articles.length} total, top 20 shown)
${articleSummaries}

## Instructions
Create a digest in this JSON format:

{
  "headline": "오늘의 핵심 한줄 (한국어, 30자 이내)",
  "market_mood": "bullish or bearish or neutral",
  "sections": [
    {
      "title": "섹션 제목 (한국어, 예: 글로벌 시장, 국내 증시, 원자재)",
      "summary": "해당 섹션 요약 (한국어, 2~3문장)",
      "sentiment": "bullish or bearish or neutral"
    }
  ],
  "key_numbers": [
    "주요 수치 한줄 (예: 코스피 2,650 (+1.2%))"
  ],
  "watch_list": [
    "오늘 주목할 포인트 (한국어, 1문장씩)"
  ]
}

Rules:
- Respond with ONLY valid JSON
- sections: 2-4개 (뉴스가 적으면 줄여도 됨)
- key_numbers: 1-3개
- watch_list: 2-3개
- All text in Korean
- Be concise and actionable`;

  try {
    const responseText = await chat(prompt);
    if (!responseText) throw new Error('AI 응답이 비어있습니다');

    const result = extractJSON(responseText, 'object');
    result.session = session;
    result.sessionName = sessionName;
    result.articleCount = articles.length;
    return result;
  } catch (err) {
    console.error(`[다이제스트] AI 생성 실패: ${err.message}`);
    return null;
  }
}

module.exports = { generateDigest, DIGEST_NAMES };
