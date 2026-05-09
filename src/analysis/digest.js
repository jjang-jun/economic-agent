const { chat, extractJSON } = require('../utils/ai-client');
const {
  AI_BUDGET,
  selectDigestArticles,
  formatDigestArticle,
  formatMarketSnapshot,
} = require('../utils/ai-budget');
const { buildReportContext } = require('../utils/report-context');

const DIGEST_NAMES = {
  preopen: '개장 전 브리핑',
  midday: '오전장 점검',
  close: '장 마감 브리핑',
  europe: '유럽장 체크',
  usopen: '미국장 오픈 브리핑',
};

const SESSION_FOCUS = {
  preopen: [
    'Focus on overnight US/Europe market implications for the Korean open.',
    'Use marketSnapshot as the pre-market board for KOSPI/KOSDAQ, USD/KRW, Korean large caps, and global risk assets.',
    'Highlight DART disclosures and company events that can affect KRX at 09:00.',
    'End with concrete opening-session watchpoints.',
  ],
  midday: [
    'Focus on Korean morning-session flow, sectors, disclosures, and macro changes.',
    'Separate what already moved from what can still matter in the afternoon.',
  ],
  close: [
    'Focus on the Korean close, after-hours implications, and candidates for stock-report follow-up.',
    'Prioritize market-moving disclosures, sector rotations, and risks for tomorrow.',
  ],
  europe: [
    'Focus on early European session, FX/rates/oil, Korean after-hours context, and US premarket setup.',
    'Connect global moves to Korean sectors for the next trading session.',
  ],
  usopen: [
    'Focus on US premarket/market open, macro releases, semiconductors/big tech, rates, oil, and next-day Korea implications.',
    'Use marketSnapshot to discuss US premarket/open signals for indexes, semiconductors, and mega-cap tech.',
    'If the news is before/after US open due to DST, frame it as US trading setup rather than daily close.',
  ],
};

async function generateDigest(articles, indicators, session) {
  if (articles.length === 0) return null;

  const sessionName = DIGEST_NAMES[session] || session;
  const selectedArticles = selectDigestArticles(articles);

  const articleSummaries = selectedArticles
    .map(formatDigestArticle)
    .join('\n');

  const indicatorInfo = [];
  if (indicators.baseRate) indicatorInfo.push(`Korea base rate: ${indicators.baseRate}%`);
  if (indicators.fedRate) indicatorInfo.push(`US Fed rate: ${indicators.fedRate}%`);
  if (indicators.cpi) indicatorInfo.push(`US CPI: ${indicators.cpi}`);
  if (indicators.unemployment) indicatorInfo.push(`US unemployment: ${indicators.unemployment}%`);
  if (indicators.marketSnapshot?.length > 0) {
    indicatorInfo.push('Market snapshot:');
    for (const line of formatMarketSnapshot(indicators.marketSnapshot, AI_BUDGET.digest.maxSnapshotItems)) {
      indicatorInfo.push(line);
    }
  }
  if (indicators.investorFlow?.latest) {
    const flow = indicators.investorFlow;
    indicatorInfo.push(
      `Investor flow (${flow.market}, ${flow.unit}): foreign ${flow.latest.foreign}, institution ${flow.latest.institution}, individual ${flow.latest.individual}, 5d foreign ${flow.sums5d?.foreign}, 5d institution ${flow.sums5d?.institution}`
    );
  }
  const reportContext = buildReportContext({
    dailySummaries: indicators.recentDailySummaries || [],
    stockReports: indicators.recentStockReports || [],
  });

  const sessionFocus = SESSION_FOCUS[session] || [];

  const prompt = `You are a financial news editor creating a "${sessionName}" digest for a Korean investor.
Summarize the following news articles into a concise briefing.

## Economic Indicators
${indicatorInfo.length > 0 ? indicatorInfo.join('\n') : '(No data)'}

## Recent Stored Context
${reportContext.length > 0 ? reportContext.join('\n') : '(No stored context)'}

## Articles (${articles.length} total, top ${selectedArticles.length} shown)
${articleSummaries}

## Session Focus
${sessionFocus.map(item => `- ${item}`).join('\n') || '- Provide a balanced investor briefing.'}

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
- Do not invent numbers, prices, or index levels not present in the articles or indicators
- Prefer source-grounded statements over generic market commentary
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
