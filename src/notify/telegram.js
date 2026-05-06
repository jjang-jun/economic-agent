const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TAG_MAP = {
  portfolio: '포트폴리오',
  upcoming_events: '생활이벤트',
  macro: '거시경제',
  career: '커리어',
};

const SENTIMENT = {
  bullish: { bar: '🔴', label: '호재' },
  bearish: { bar: '🔵', label: '악재' },
  neutral: { bar: '⚪', label: '중립' },
};

function formatKRW(value) {
  if (typeof value !== 'number') return '';
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

// FinBERT confidence 기반 강도 표시
function getSentimentDisplay(article) {
  const base = SENTIMENT[article.sentiment] || SENTIMENT.neutral;
  const conf = article.finbertConfidence;

  // FinBERT confidence가 없으면 (한국어 기사) 기본 표시
  if (!conf) return base;

  // confidence 기반 강도 세분화
  if (article.sentiment === 'bullish') {
    if (conf >= 0.85) return { bar: '🔴', label: '강한 호재' };
    if (conf >= 0.6) return { bar: '🔴', label: '호재' };
    return { bar: '🟠', label: '약한 호재' };
  }
  if (article.sentiment === 'bearish') {
    if (conf >= 0.85) return { bar: '🔵', label: '강한 악재' };
    if (conf >= 0.6) return { bar: '🔵', label: '악재' };
    return { bar: '🟣', label: '약한 악재' };
  }
  return base;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMessage(article) {
  const s = getSentimentDisplay(article);
  const relevanceTags = (article.relevanceTags || [])
    .map(t => `#${TAG_MAP[t] || t}`);
  const sectorTags = (article.sectors || [])
    .map(t => `#${t}`);
  const tags = [...sectorTags, ...relevanceTags].join(' ');

  const date = new Date(article.pubDate).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });

  // 영문 기사는 번역 제목 사용
  const displayTitle = article.titleKo || article.title;
  const title = escapeHtml(displayTitle);
  const source = escapeHtml(article.source);
  const reason = article.reason ? escapeHtml(article.reason) : '';

  // 영문 원제가 있으면 작게 표시
  const hasTranslation = article.titleKo && article.titleKo !== article.title;
  const originalLine = hasTranslation ? `<i>${escapeHtml(article.title)}</i>` : '';

  const lines = [
    `${s.bar} <b>${s.label}</b> | <b>${title}</b>`,
    originalLine,
    reason ? `근거: ${reason}` : '',
    `출처: ${source} · ${date}${tags ? ' · ' + tags : ''}`,
    `<a href="${article.link}">기사 원문 →</a>`,
  ];

  return lines.filter(l => l !== '').join('\n');
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('[Telegram] 봇 토큰 또는 채팅 ID가 설정되지 않았습니다.');
    console.log('[알림 미리보기]\n' + text);
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram 전송 실패: ${res.status} ${body}`);
  }
}

async function notifyArticles(articles) {
  let sent = 0;
  for (const article of articles) {
    const message = formatMessage(article);
    try {
      await sendTelegramMessage(message);
      sent++;
      if (articles.length > 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      if (err.message.includes('429')) {
        const wait = parseInt(err.message.match(/retry after (\d+)/)?.[1] || '5', 10);
        console.warn(`[Telegram] Rate limit, ${wait}초 대기 후 재시도...`);
        await new Promise(r => setTimeout(r, wait * 1000));
        try {
          await sendTelegramMessage(message);
          sent++;
        } catch (retryErr) {
          console.error(`[Telegram] 재시도 실패: ${article.title} - ${retryErr.message}`);
        }
      } else {
        console.error(`[Telegram] 전송 실패: ${article.title} - ${err.message}`);
      }
    }
  }
  return sent;
}


function formatStockReport(report) {
  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });

  const sectorLines = (report.sectors || []).map(s => {
    const icon = SENTIMENT[s.signal] || SENTIMENT.neutral;
    return `${icon.bar} <b>${escapeHtml(s.name)}</b>  [${icon.label}]\n└ ${escapeHtml(s.reason)}`;
  });

  const stockLines = (report.stocks || []).map(s => {
    const icon = SENTIMENT[s.signal] || SENTIMENT.neutral;
    const ticker = s.ticker ? `  ${s.ticker}` : '';
    const conviction = s.conviction ? ` · 확신도 ${escapeHtml(s.conviction)}` : '';
    const risk = s.risk ? `\n⚠ ${escapeHtml(s.risk)}` : '';
    const profile = s.risk_profile || {};
    const market = s.market_profile || {};
    const rr = profile.riskReward ? `손익비 ${profile.riskReward}:1` : '';
    const stop = profile.expectedLossPct ? `손절폭 ${profile.expectedLossPct}%` : '';
    const size = profile.suggestedAmount ? `제안 ${formatKRW(profile.suggestedAmount)} (${profile.suggestedWeightPct}%)` : '';
    const rs = typeof market.relativeStrength20d === 'number' ? `RS20 ${market.relativeStrength20d}%p` : '';
    const volume = typeof market.volumeRatio20d === 'number' ? `거래량 ${market.volumeRatio20d}x` : '';
    const high = market.breakout20d
      ? '20일 돌파'
      : (typeof market.distanceFrom20dHighPct === 'number' ? `20일고점 ${market.distanceFrom20dHighPct}%` : '');
    const tradeable = profile.tradeable === false ? '거래불가/관찰' : '';
    const invalidation = profile.invalidation ? `\n무효화: ${escapeHtml(profile.invalidation)}` : '';
    const riskProfile = [rr, stop, size, rs, volume, high, tradeable].filter(Boolean).join(' · ');
    return `${icon.bar} <b>${escapeHtml(s.name)}</b>${ticker}  [${icon.label}${conviction}]\n└ ${escapeHtml(s.reason)}${riskProfile ? `\n└ ${escapeHtml(riskProfile)}` : ''}${invalidation}${risk}`;
  });

  const actionLines = (report.action_items || []).map(item =>
    `▸ ${escapeHtml(item)}`
  );
  const riskLines = (report.risk_flags || []).map(item =>
    `▸ ${escapeHtml(item)}`
  );
  const decision = report.decision || {};
  const regime = decision.market?.regime || 'UNKNOWN';
  const regimeScore = typeof decision.market?.score === 'number' ? ` (${decision.market.score})` : '';
  const regimeTags = (decision.market?.tags || []).map(tag => `#${escapeHtml(tag)}`).join(' ');
  const decisionReasons = (decision.market?.reasons || []).map(item => `└ ${escapeHtml(item)}`);
  const decisionWarnings = (decision.market?.warnings || []).map(item => `▸ ${escapeHtml(item)}`);
  const decisionActions = (decision.actions || []).map(item => `▸ ${escapeHtml(item)}`);
  const portfolio = decision.portfolio || {};
  const portfolioSummary = portfolio.summary || {};
  const riskBudget = portfolio.riskBudget || {};
  const portfolioLines = [
    portfolioSummary.totalAssetValue ? `총자산: ${formatKRW(portfolioSummary.totalAssetValue)}` : '',
    portfolioSummary.cashAmount ? `현금: ${formatKRW(portfolioSummary.cashAmount)} (${portfolioSummary.cashPct}%)` : `현금 비중: ${portfolioSummary.cashPct ?? 0}%`,
    typeof portfolio.unrealizedPnl === 'number' ? `평가손익: ${formatKRW(portfolio.unrealizedPnl)} (${portfolio.unrealizedPnlPct ?? 0}%)` : '',
    portfolioSummary.maxNewBuyAmount ? `1회 신규 매수 상한: ${formatKRW(portfolioSummary.maxNewBuyAmount)}` : '',
    riskBudget.maxRisk1Pct ? `거래 1회 손실 허용: ${formatKRW(riskBudget.maxRisk1Pct)}~${formatKRW(riskBudget.maxRisk2Pct)}` : '',
    `보유 종목: ${portfolioSummary.positionCount ?? 0}개`,
  ].filter(Boolean).map(item => `▸ ${escapeHtml(item)}`);
  const positionLines = (portfolio.positions || [])
    .filter(position => position.marketValue || position.currentPrice)
    .slice(0, 5)
    .map(position => {
      const pnl = typeof position.unrealizedPnl === 'number'
        ? ` · 손익 ${formatKRW(position.unrealizedPnl)} (${position.unrealizedPnlPct}%)`
        : '';
      const weight = typeof position.weight === 'number' ? ` · 비중 ${Math.round(position.weight * 100)}%` : '';
      return `▸ ${escapeHtml(position.name || position.ticker)} ${position.currentPrice?.toLocaleString('ko-KR') || ''}${pnl}${weight}`;
    });

  const sections = [
    [
      `📊 <b>장 마감 의사결정 리포트</b>`,
      `⏰ ${now}`,
    ].join('\n'),

    `한줄 판단: <b>${escapeHtml(report.market_summary || '')}</b>`,

    [
      `<b>1. 시장 레짐</b>`,
      `${escapeHtml(regime)}${regimeScore}`,
      regimeTags,
      decisionReasons.join('\n'),
      decisionWarnings.length > 0 ? `<b>경고</b>\n${decisionWarnings.join('\n')}` : '',
    ].join('\n'),

    [
      `<b>2. 내 포트폴리오 기준</b>`,
      portfolioLines.join('\n'),
      positionLines.length > 0 ? `<b>보유 평가</b>\n${positionLines.join('\n')}` : '',
    ].join('\n'),

    [
      `<b>3. 섹터 동향</b>`,
      sectorLines.join('\n\n'),
    ].join('\n'),

    [
      `<b>4. 후보 종목</b>`,
      stockLines.join('\n\n'),
    ].join('\n'),

    [
      `<b>5. 내일 체크포인트</b>`,
      actionLines.slice(0, 4).join('\n'),
    ].join('\n'),

    riskLines.length > 0
      ? [
          `<b>6. 리스크 플래그</b>`,
          riskLines.slice(0, 4).join('\n'),
        ].join('\n')
      : null,

    [
      `<b>7. 행동 가드레일</b>`,
      decisionActions.slice(0, 4).join('\n'),
    ].join('\n'),

    `<i>정보 제공용입니다. 최종 매매는 포트폴리오/리스크 기준으로 판단하세요.</i>`,
  ];

  return sections.filter(Boolean).join('\n\n');
}

async function sendStockReport(report) {
  const message = formatStockReport(report);
  try {
    await sendTelegramMessage(message);
    console.log('[종목분석] 리포트 전송 완료');
    return true;
  } catch (err) {
    console.error(`[종목분석] 전송 실패: ${err.message}`);
    return false;
  }
}

const SESSION_EMOJI = {
  preopen: '🌅',
  midday: '☀️',
  close: '🔔',
  europe: '🌆',
  usopen: '🇺🇸',
};

function formatDigest(digest) {
  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });

  const emoji = SESSION_EMOJI[digest.session] || '📰';
  const moodIcon = SENTIMENT[digest.market_mood] || SENTIMENT.neutral;

  const sectionLines = (digest.sections || []).map(s => {
    const icon = SENTIMENT[s.sentiment] || SENTIMENT.neutral;
    return `${icon.bar} <b>${escapeHtml(s.title)}</b>\n${escapeHtml(s.summary)}`;
  });

  const numberLines = (digest.key_numbers || []).map(n =>
    `📌 ${escapeHtml(n)}`
  );

  const watchLines = (digest.watch_list || []).map(w =>
    `▸ ${escapeHtml(w)}`
  );

  const sections = [
    [
      `${emoji} <b>${digest.sessionName}</b> | ${moodIcon.bar} ${moodIcon.label}`,
      `⏰ ${now} · ${digest.articleCount}건 분석`,
    ].join('\n'),

    `핵심: <b>${escapeHtml(digest.headline || '')}</b>`,

    sectionLines.join('\n\n'),

    numberLines.length > 0
      ? [`<b>주요 수치</b>`, ...numberLines.slice(0, 3)].join('\n')
      : null,

    watchLines.length > 0
      ? [`<b>오늘 볼 것</b>`, ...watchLines.slice(0, 3)].join('\n')
      : null,
  ];

  return sections.filter(Boolean).join('\n\n');
}

async function sendDigest(digest) {
  const message = formatDigest(digest);
  try {
    await sendTelegramMessage(message);
    console.log(`[다이제스트] ${digest.sessionName} 전송 완료`);
    return true;
  } catch (err) {
    console.error(`[다이제스트] 전송 실패: ${err.message}`);
    return false;
  }
}

function formatPerformanceReport(completed) {
  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });

  const lines = completed.map(({ recommendation, day, evaluation }) => {
    const icon = evaluation.signalReturnPct >= 0 ? '🔴' : '🔵';
    const ticker = recommendation.ticker ? ` ${escapeHtml(recommendation.ticker)}` : '';
    const alpha = typeof evaluation.alphaPct === 'number'
      ? ` · 초과 ${evaluation.alphaPct}%`
      : '';
    return [
      `${icon} <b>${escapeHtml(recommendation.name)}</b>${ticker} · ${day}일`,
      `└ 실제 ${evaluation.returnPct}% · 신호기준 ${evaluation.signalReturnPct}%${alpha}`,
      `└ ${escapeHtml(recommendation.signal)} / ${escapeHtml(recommendation.conviction)}`,
    ].join('\n');
  });

  const avg = completed.reduce((sum, item) => sum + item.evaluation.signalReturnPct, 0) / completed.length;

  return [
    `📈 <b>추천 성과 평가</b>`,
    `⏰ ${now}`,
    `평균 신호기준 수익률: <b>${avg.toFixed(2)}%</b>`,
    '',
    lines.join('\n\n'),
  ].join('\n');
}

async function sendPerformanceReport(completed) {
  const message = formatPerformanceReport(completed);
  try {
    await sendTelegramMessage(message);
    console.log('[성과평가] 리포트 전송 완료');
    return true;
  } catch (err) {
    console.error(`[성과평가] 전송 실패: ${err.message}`);
    return false;
  }
}

function formatTradePerformanceReport(report) {
  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  const topLines = (report.positions || [])
    .filter(item => item.trade.side === 'buy')
    .slice(0, 5)
    .map(item => {
      const trade = item.trade;
      const pnl = typeof item.pnl === 'number' ? ` · 손익 ${formatKRW(item.pnl)} (${item.returnPct}%)` : '';
      const link = trade.recommendationId ? ' · 추천연결' : '';
      return `▸ ${escapeHtml(trade.name || trade.ticker || trade.symbol)} ${formatKRW(item.entryAmount)}${pnl}${link}`;
    });

  return [
    `📒 <b>실제 거래 성과</b>`,
    `⏰ ${now}`,
    `거래: ${report.totalTrades}건 · 매수 ${report.buyTrades}건 · 매도 ${report.sellTrades}건`,
    `추천 연결: ${report.linkedRecommendations}건`,
    `평가손익: <b>${formatKRW(report.totalPnl)}</b> (${report.totalReturnPct ?? 0}%)`,
    topLines.length > 0 ? topLines.join('\n') : '아직 평가 가능한 실제 거래가 없습니다.',
  ].join('\n');
}

async function sendTradePerformanceReport(report) {
  const message = formatTradePerformanceReport(report);
  try {
    await sendTelegramMessage(message);
    console.log('[거래성과] 리포트 전송 완료');
    return true;
  } catch (err) {
    console.error(`[거래성과] 전송 실패: ${err.message}`);
    return false;
  }
}

module.exports = {
  notifyArticles, sendStockReport, sendDigest, sendPerformanceReport, sendTradePerformanceReport,
  formatMessage, formatStockReport, formatDigest, formatPerformanceReport, formatTradePerformanceReport,
};
