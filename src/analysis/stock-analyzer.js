const { chat, extractJSON } = require('../utils/ai-client');
const MY_INTERESTS = require('../config/interests');
const {
  AI_BUDGET,
  selectStockReportArticles,
  formatStockReportArticle,
  formatMarketSnapshot,
} = require('../utils/ai-budget');

async function analyzeStocks(articles, indicators) {
  if (articles.length === 0) return null;

  const selectedArticles = selectStockReportArticles(articles);
  const articleSummaries = selectedArticles
    .map(formatStockReportArticle)
    .join('\n');

  const indicatorInfo = [];
  if (indicators.baseRate) indicatorInfo.push(`Korea base rate: ${indicators.baseRate}%`);
  if (indicators.fedRate) indicatorInfo.push(`US Fed rate: ${indicators.fedRate}%`);
  if (indicators.cpi) indicatorInfo.push(`US CPI: ${indicators.cpi}`);
  if (indicators.unemployment) indicatorInfo.push(`US unemployment: ${indicators.unemployment}%`);
  if (indicators.marketSnapshot?.length > 0) {
    indicatorInfo.push('Market snapshot:');
    for (const line of formatMarketSnapshot(indicators.marketSnapshot, AI_BUDGET.stockReport.maxSnapshotItems)) {
      indicatorInfo.push(line);
    }
  }
  if (indicators.investorFlow?.latest) {
    const flow = indicators.investorFlow;
    indicatorInfo.push(
      `Investor flow (${flow.market}, ${flow.unit}): foreign ${flow.latest.foreign}, institution ${flow.latest.institution}, individual ${flow.latest.individual}, 5d foreign ${flow.sums5d?.foreign}, 5d institution ${flow.sums5d?.institution}`
    );
  }

  // interests.js에서 포트폴리오 관심사 동적 로드
  const interestList = Object.entries(MY_INTERESTS)
    .map(([k, v]) => `${k}: ${v.join(', ')}`)
    .join('\n');

  const prompt = `You are a stock market analyst for Korean individual investors.
Analyze today's economic news and indicators, then provide sector/stock investment insights.

## Economic Indicators
${indicatorInfo.length > 0 ? indicatorInfo.join('\n') : '(No data)'}

## Today's Key News (${articles.length} articles, top ${selectedArticles.length} shown)
${articleSummaries}

## User's Areas of Interest
${interestList}

## Instructions
Based on the news and indicators above, respond with ONLY this JSON format:

{
  "market_summary": "One-line market assessment in Korean (under 50 chars)",
  "sectors": [
    {
      "name": "Sector name in Korean (e.g. 반도체, 2차전지, 금융)",
      "signal": "bullish or bearish or neutral",
      "reason": "News-based reasoning in Korean (1-2 sentences)"
    }
  ],
  "stocks": [
    {
      "name": "Stock name (Korean-listed)",
      "ticker": "Ticker code if known, empty string otherwise",
      "signal": "bullish or bearish or neutral",
      "conviction": "high or medium or low",
      "thesis": "Core investment thesis in Korean, 1 sentence",
      "target_horizon": "1d or 1w or 1m",
      "reason": "News-based reasoning in Korean (1-2 sentences)",
      "risk": "Main downside risk in Korean (1 sentence)",
      "invalidation": "What would prove the thesis wrong, in Korean",
      "failure_reason": "Most likely way this recommendation can fail, in Korean",
      "upside_probability_pct": 55,
      "expected_upside_pct": 12,
      "expected_loss_pct": 6,
      "stop_loss_pct": 6,
      "risk_reward": 2.0,
      "related_news": [0, 1]
    }
  ],
  "action_items": [
    "Tomorrow's market watchpoint in Korean (1 sentence each)"
  ],
  "risk_flags": [
    "Risk factor that can invalidate the recommendation in Korean"
  ]
}

Rules:
- Respond with ONLY valid JSON
- sectors: 2-4, stocks: 3-6, action_items: 2-4, risk_flags: 2-4
- Only recommend stocks directly mentioned or affected by the news
- Focus on KOSPI/KOSDAQ listed stocks
- Use low conviction if the evidence is only indirect or macro-level
- Do not invent ticker codes
- Avoid unconditional buy/sell wording; frame outputs as candidates gated by market regime and risk
- In a strong but overheated market, prefer trend-following candidates only when they have direct AI/semiconductor/infrastructure linkage, strong relative strength, sufficient liquidity, and foreign/institution support
- Penalize vague theme stocks, weak relative-strength stocks, large one-day chase entries, and recommendations without an invalidation or stop-loss condition
- For aggressive candidates, mention split-entry and the condition that would invalidate the setup
- Every bullish stock must include expected_upside_pct, expected_loss_pct, stop_loss_pct, risk_reward, and invalidation. If the data is insufficient, set signal to neutral or conviction to low
- Prefer candidates with risk_reward >= 2.0 and expected_loss_pct <= 10. Avoid illiquid stocks or recommendations based only on sector labels
- Every stock must include thesis, target_horizon, invalidation, and failure_reason. target_horizon must be one of 1d, 1w, 1m
- This is for informational purposes, not investment advice`;

  try {
    const responseText = await chat(prompt);
    if (!responseText) throw new Error('AI 응답이 비어있습니다');

    return extractJSON(responseText, 'object');
  } catch (err) {
    console.error(`[종목분석] AI 분석 실패: ${err.message}`);
    return null;
  }
}

module.exports = { analyzeStocks };
