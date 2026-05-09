const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_PRIVATE_CHAT_ID = process.env.TELEGRAM_PRIVATE_CHAT_ID
  || process.env.TELEGRAM_SECRET_CHAT_ID
  || process.env.TELEGRAM_AGENT_CHAT_ID
  || process.env.TELEGRAM_PORTFOLIO_CHAT_ID;

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

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatAssetPrice(value, currency = 'KRW') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (currency === 'USD') return `$${round(value, 2).toLocaleString('ko-KR')}`;
  return formatPrice(value);
}

function isKoreanStockTicker(ticker) {
  return /^\d{6}(?:\.(?:KS|KQ))?$/i.test(String(ticker || '').trim());
}

function getWholeSharePlan({ ticker, amount, entryPrice }) {
  if (!isKoreanStockTicker(ticker) || typeof amount !== 'number' || typeof entryPrice !== 'number' || entryPrice <= 0) {
    return null;
  }
  const shares = Math.floor(amount / entryPrice);
  if (shares <= 0) {
    return {
      shares: 0,
      amount: 0,
      note: `1주 매수에 필요한 금액 ${formatKRW(entryPrice)}보다 제안금액이 작습니다.`,
    };
  }
  return {
    shares,
    amount: shares * entryPrice,
    note: '',
  };
}

function formatQuantity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return Number.isInteger(value) ? `${value.toLocaleString('ko-KR')}주` : `${round(value, 4)}주`;
}

function formatRegime(regime, score) {
  const labels = {
    STRONG_RISK_ON: '강한 공격 가능',
    RISK_ON: '공격 가능',
    FRAGILE_RISK_ON: '제한적 공격',
    NEUTRAL: '중립',
    RISK_OFF: '방어 우선',
    PANIC: '위기',
    UNKNOWN: '판단 보류',
  };
  const descriptions = {
    STRONG_RISK_ON: '상승 폭이 비교적 넓어 신규 매수를 검토할 수 있지만 손절선과 비중 제한은 유지해야 하는 상태',
    RISK_ON: '시장 점수가 좋아 신규 매수를 검토할 수 있는 상태',
    FRAGILE_RISK_ON: '지수는 강하지만 과열이나 대형주 쏠림이 있어 손익비와 거래량 확인을 더 엄격히 해야 하는 상태',
    NEUTRAL: '상승/하락 신호가 뚜렷하지 않아 비중을 크게 늘리기보다 관찰과 분할 접근이 필요한 상태',
    RISK_OFF: '시장 위험이 커져 신규 매수를 줄이고 현금과 손절 기준을 우선해야 하는 상태',
    PANIC: '급격한 위험 회피 상태',
    UNKNOWN: '판단 데이터 부족',
  };
  const scoreText = typeof score === 'number' ? `점수 ${score}` : '점수 없음';
  return `${labels[regime] || regime} (${scoreText}) - ${descriptions[regime] || ''}`;
}

function explainDecisionReason(reason) {
  if (reason.startsWith('VIX ')) {
    return `${reason} - VIX는 미국 주식시장 공포/변동성 지표입니다. 18 이하는 대체로 시장이 크게 겁먹지 않은 구간으로 봅니다.`;
  }
  if (reason.startsWith('USD/KRW ') && reason.includes('상승')) {
    return `${reason} - 달러/원 환율이 올랐다는 뜻입니다. 원화 기준으로 달러가 비싸졌고, 국내 증시에는 부담이 될 수 있습니다.`;
  }
  return reason;
}

function explainRiskBlocker(blocker) {
  const text = String(blocker || '');
  const match = text.match(/risk_reward:\s*([0-9.]+):1\s*(?:\/|<)\s*min\s*([0-9.]+):1/i)
    || text.match(/risk_reward:\s*([0-9.]+):1\s*<\s*([0-9.]+):1/i);
  if (match) {
    return `손익비 부족: 기대수익이 예상손실의 ${match[1]}배라서, 최소 기준 ${match[2]}배에 못 미칩니다.`;
  }
  if (text.startsWith('stop_loss:')) return `손절 기준 문제: ${text.replace('stop_loss:', '').trim()}`;
  if (text.startsWith('position_size:')) return `매수 가능 금액 없음: ${text.replace('position_size:', '').trim()}`;
  if (text.startsWith('market_regime:')) return `시장 상태 차단: ${text.replace('market_regime:', '').trim()}`;
  if (text.startsWith('sector_limit:')) return `섹터 비중 초과: ${text.replace('sector_limit:', '').trim()}`;
  if (text.startsWith('lot_size:')) return `정수 주식 매수 불가: ${text.replace('lot_size:', '').trim()}`;
  return text;
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

  const date = article.pubDatePrecision === 'date'
    ? `${new Date(article.pubDate).toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
    })} 공시일`
    : new Date(article.pubDate).toLocaleString('ko-KR', {
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

function getTelegramChatId(channel = 'public') {
  if (channel === 'private') return TELEGRAM_PRIVATE_CHAT_ID || TELEGRAM_CHAT_ID;
  return TELEGRAM_CHAT_ID;
}

async function sendTelegramMessage(text, options = {}) {
  const chatId = options.chatId || getTelegramChatId(options.channel || 'public');
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    console.warn('[Telegram] 봇 토큰 또는 채팅 ID가 설정되지 않았습니다.');
    console.log('[알림 미리보기]\n' + text);
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (options.replyMarkup) payload.reply_markup = options.replyMarkup;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram 전송 실패: ${res.status} ${body}`);
  }
}

async function answerTelegramCallbackQuery(callbackQueryId, text = '') {
  if (!TELEGRAM_BOT_TOKEN || !callbackQueryId) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram callback 응답 실패: ${res.status} ${body}`);
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

  const decision = report.decision || {};
  const portfolio = decision.portfolio || {};
  const portfolioSummary = portfolio.summary || {};

  const stockLines = (report.stocks || []).map(s => {
    const icon = SENTIMENT[s.signal] || SENTIMENT.neutral;
    const ticker = s.ticker ? `  ${s.ticker}` : '';
    const conviction = s.conviction ? ` · 확신도 ${escapeHtml(s.conviction)}` : '';
    const risk = s.risk ? `\n⚠ ${escapeHtml(s.risk)}` : '';
    const profile = s.risk_profile || {};
    const market = s.market_profile || {};
    const fundamental = s.fundamental_profile || {};
    const statements = fundamental.statements || {};
    const earnings = fundamental.earnings || {};
    const review = s.risk_review || {};
    const entry = profile.entryReferencePrice ? `기준매수가 ${formatPrice(profile.entryReferencePrice)}` : '';
    const stopPrice = profile.stopLossPrice ? `손절가 ${formatPrice(profile.stopLossPrice)}` : '';
    const rr = profile.riskReward ? `손익비 ${profile.riskReward}:1` : '';
    const stop = profile.expectedLossPct ? `예상 손실폭 ${profile.expectedLossPct}%` : '';
    const suggestedCashPct = profile.suggestedAmount && portfolioSummary.cashAmount
      ? round((profile.suggestedAmount / portfolioSummary.cashAmount) * 100, 1)
      : null;
    const suggestedAmount = typeof profile.suggestedAmount === 'number' && typeof portfolio.maxNewBuyAmount === 'number'
      ? Math.min(profile.suggestedAmount, portfolio.maxNewBuyAmount)
      : profile.suggestedAmount;
    const wasCapped = typeof profile.suggestedAmount === 'number'
      && typeof suggestedAmount === 'number'
      && suggestedAmount < profile.suggestedAmount;
    const size = suggestedAmount
      ? `제안 매수 ${formatKRW(suggestedAmount)}${wasCapped ? ' (1회 상한)' : ''} (총자산 ${profile.suggestedWeightPct}%, 현금 ${suggestedCashPct ?? '?'}%)`
      : '';
    const rs = typeof market.relativeStrength20d === 'number' ? `RS20 ${market.relativeStrength20d}%p` : '';
    const volume = typeof market.volumeRatio20d === 'number' ? `거래량 ${market.volumeRatio20d}x` : '';
    const high = market.breakout20d
      ? '20일 돌파'
      : (typeof market.distanceFrom20dHighPct === 'number' ? `20일고점 ${market.distanceFrom20dHighPct}%` : '');
    const sector = fundamental.sector ? `${fundamental.sector}` : '';
    const marketCap = typeof fundamental.marketCapUsd === 'number'
      ? `시총 $${round(fundamental.marketCapUsd / 1_000_000_000, 1)}B`
      : '';
    const beta = typeof fundamental.beta === 'number' ? `beta ${fundamental.beta}` : '';
    const revenueGrowth = typeof statements.revenueGrowthYoYPct === 'number' ? `매출YoY ${statements.revenueGrowthYoYPct}%` : '';
    const fcfMargin = typeof statements.freeCashFlowMarginPct === 'number' ? `FCF마진 ${statements.freeCashFlowMarginPct}%` : '';
    const nextEarnings = earnings.nextDate ? `실적 ${earnings.nextDate}` : '';
    const tradeable = review.action === 'watch_only' || profile.tradeable === false ? '거래불가/관찰' : '';
    const invalidation = profile.invalidation ? `\n무효화: ${escapeHtml(profile.invalidation)}` : '';
    const blockers = (review.blockers || []).slice(0, 2).map(item => `\n차단: ${escapeHtml(explainRiskBlocker(item))}`).join('');
    const warnings = (review.warnings || []).slice(0, 1).map(item => `\n주의: ${escapeHtml(item)}`).join('');
    const riskProfile = [entry, stopPrice, rr, stop, size, rs, volume, high, sector, marketCap, beta, revenueGrowth, fcfMargin, nextEarnings, tradeable].filter(Boolean).join(' · ');
    return `${icon.bar} <b>${escapeHtml(s.name)}</b>${ticker}  [${icon.label}${conviction}]\n└ ${escapeHtml(s.reason)}${riskProfile ? `\n└ ${escapeHtml(riskProfile)}` : ''}${invalidation}${blockers}${warnings}${risk}`;
  });

  const actionLines = (report.action_items || []).map(item =>
    `▸ ${escapeHtml(item)}`
  );
  const riskLines = (report.risk_flags || []).map(item =>
    `▸ ${escapeHtml(item)}`
  );
  const regime = decision.market?.regime || 'UNKNOWN';
  const regimeText = formatRegime(regime, decision.market?.score);
  const regimeTags = (decision.market?.tags || []).map(tag => `#${escapeHtml(tag)}`).join(' ');
  const decisionReasons = (decision.market?.reasons || []).map(item => `└ ${escapeHtml(explainDecisionReason(item))}`);
  const decisionWarnings = (decision.market?.warnings || []).map(item => `▸ ${escapeHtml(item)}`);
  const decisionActions = (decision.actions || []).map(item => `▸ ${escapeHtml(item)}`);
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
      const manual = position.quoteSource === 'manual' ? ' · 수동손익' : '';
      const weight = typeof position.weight === 'number' ? ` · 비중 ${Math.round(position.weight * 100)}%` : '';
      return `▸ ${escapeHtml(position.name || position.ticker)} ${position.currentPrice?.toLocaleString('ko-KR') || ''}${pnl}${manual}${weight}`;
    });

  const sections = [
    [
      `📊 <b>장 마감 의사결정 리포트</b>`,
      `⏰ ${now}`,
    ].join('\n'),

    `한줄 판단: <b>${escapeHtml(report.market_summary || '')}</b>`,

    [
      `<b>1. 시장 레짐</b>`,
      `${escapeHtml(regimeText)}`,
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
    await sendTelegramMessage(message, { channel: 'private' });
    console.log('[종목분석] 리포트 전송 완료');
    return true;
  } catch (err) {
    console.error(`[종목분석] 전송 실패: ${err.message}`);
    return false;
  }
}

function formatActionReport(report) {
  const portfolio = report.portfolio || {};
  const portfolioLines = [
    portfolio.totalAssetValue ? `총자산 ${formatKRW(portfolio.totalAssetValue)}` : '',
    typeof portfolio.cashAmount === 'number' ? `현금 ${formatKRW(portfolio.cashAmount)} (${Math.round((portfolio.cashRatio || 0) * 100)}%)` : '',
    typeof portfolio.unrealizedPnl === 'number' ? `평가손익 ${formatKRW(portfolio.unrealizedPnl)} (${portfolio.unrealizedPnlPct ?? 0}%)` : '',
    `보유 ${portfolio.positionCount || 0}개`,
  ].filter(Boolean).map(item => `▸ ${escapeHtml(item)}`);

  const formatRecommendation = item => {
    const risk = item.riskProfile || item.risk_profile || {};
    const review = item.riskReview || item.risk_review || {};
    const market = item.marketProfile || item.market_profile || {};
    const entryData = item.entry || {};
    const suggestedAmount = typeof risk.suggestedAmount === 'number' && typeof portfolio.maxNewBuyAmount === 'number'
      ? Math.min(risk.suggestedAmount, portfolio.maxNewBuyAmount)
      : risk.suggestedAmount;
    const wasCapped = typeof risk.suggestedAmount === 'number'
      && typeof suggestedAmount === 'number'
      && suggestedAmount < risk.suggestedAmount;
    const entryPrice = [risk.entryReferencePrice, entryData.price, market.price]
      .find(value => typeof value === 'number' && Number.isFinite(value) && value > 0) || null;
    const expectedLossPct = typeof risk.expectedLossPct === 'number' ? Math.abs(risk.expectedLossPct) : null;
    const stopPrice = typeof risk.stopLossPrice === 'number'
      ? risk.stopLossPrice
      : (entryPrice && expectedLossPct ? entryPrice * (1 - expectedLossPct / 100) : null);
    const sharePlan = getWholeSharePlan({ ticker: item.ticker, amount: suggestedAmount, entryPrice });
    const priceCurrency = risk.currency || entryData.currency || market.currency || (isKoreanStockTicker(item.ticker) ? 'KRW' : 'KRW');
    const entry = entryPrice ? ` · 기준매수가 ${formatAssetPrice(entryPrice, priceCurrency)}` : '';
    const stop = stopPrice ? ` · 손절가 ${formatAssetPrice(stopPrice, priceCurrency)}` : '';
    const size = sharePlan?.shares === 0
      ? ` · 매수 보류: ${sharePlan.note}${wasCapped ? ' 1회 상한 조정 필요' : ''}`
      : sharePlan
      ? ` · 제안 ${formatQuantity(sharePlan.shares)} / ${formatKRW(sharePlan.amount)}${wasCapped ? ' (1회 상한)' : ''}`
      : (suggestedAmount ? ` · 제안 ${formatKRW(suggestedAmount)}${wasCapped ? ' (1회 상한)' : ''}` : '');
    const rr = risk.riskReward ? ` · 손익비 ${risk.riskReward}:1` : '';
    const blockers = (review.blockers || []).slice(0, 1).map(explainRiskBlocker).join(', ');
    return `▸ ${escapeHtml(item.name || item.ticker)} ${escapeHtml(item.ticker || '')}${entry}${stop}${size}${rr}${blockers ? ` · 차단 ${escapeHtml(blockers)}` : ''}`;
  };

  const formatPosition = (item, action = 'hold') => {
    const pnl = typeof item.unrealizedPnl === 'number'
      ? ` · 손익 ${formatKRW(item.unrealizedPnl)} (${item.unrealizedPnlPct}%)`
      : '';
    const weight = typeof item.weight === 'number' ? ` · 비중 ${Math.round(item.weight * 100)}%` : '';
    const reasons = (item.actionReasons || []).slice(0, 2).join(', ');
    const evidence = (item.actionEvidence || []).slice(0, 3).join(', ');
    const currency = item.priceCurrency || item.currency || (isKoreanStockTicker(item.ticker) ? 'KRW' : 'USD');
    const currentPrice = typeof item.currentPrice === 'number' ? ` · 현재가 ${formatAssetPrice(item.currentPrice, currency)}` : '';
    const stopLossPct = typeof item.stopLossPct === 'number'
      ? item.stopLossPct
      : (typeof item.actionStopLossPct === 'number' ? item.actionStopLossPct : null);
    const stopReferencePrice = typeof item.actionStopPrice === 'number'
      ? item.actionStopPrice
      : (stopLossPct && typeof item.avgPrice === 'number'
        ? item.avgPrice * (1 - Math.abs(stopLossPct) / 100)
        : null);
    const stopPlan = item.actionStopPlan || {};
    const stopLabel = stopPlan.trailingApplied ? '수익보호 손절가' : '참고 손절가';
    const stopPrice = stopReferencePrice
      ? ` · ${stopLabel} ${formatAssetPrice(stopReferencePrice, currency)}`
      : '';
    const trim = action === 'reduce' ? formatTrimSuggestion(item) : '';
    const reasonText = reasons ? ` · 판단 ${escapeHtml(reasons)}` : '';
    const evidenceText = evidence ? ` · 근거 ${escapeHtml(evidence)}` : '';
    return `▸ ${escapeHtml(item.name || item.ticker)}${currentPrice}${pnl}${weight}${stopPrice}${trim}${reasonText}${evidenceText}`;
  };

  function formatTrimSuggestion(item) {
    const plan = item.actionTrimPlan || {};
    const quantity = typeof item.quantity === 'number' ? item.quantity : null;
    const value = typeof item.marketValue === 'number' ? item.marketValue : null;
    const currentPrice = typeof item.currentPrice === 'number' ? item.currentPrice : null;
    const weight = typeof item.weight === 'number' ? item.weight : null;
    const maxPositionRatio = typeof portfolio.maxPositionRatio === 'number' ? portfolio.maxPositionRatio : null;

    if (typeof plan.quantity === 'number' && plan.quantity > 0) {
      return ` · 축소안 ${formatQuantity(plan.quantity)} 매도`;
    }
    if (typeof plan.amount === 'number' && plan.amount > 0) {
      return ` · 축소안 ${formatKRW(plan.amount)} 매도`;
    }

    if (quantity && currentPrice && weight && maxPositionRatio && weight > maxPositionRatio) {
      const targetValue = (portfolio.totalAssetValue || 0) * maxPositionRatio;
      const reduceValue = Math.max(0, value - targetValue);
      const shares = isKoreanStockTicker(item.ticker) ? Math.ceil(reduceValue / currentPrice) : reduceValue / currentPrice;
      if (shares > 0) return ` · 축소안 ${formatQuantity(Math.min(shares, quantity))} 매도`;
    }

    if (quantity) {
      const shares = isKoreanStockTicker(item.ticker) ? Math.max(1, Math.floor(quantity * 0.25)) : quantity * 0.25;
      return ` · 축소안 약 25% (${formatQuantity(shares)}) 매도`;
    }
    if (value) return ` · 축소안 약 25% (${formatKRW(value * 0.25)}) 매도`;
    return ' · 축소안 25% 내외 일부 매도';
  }

  const sections = [
    [
      '📋 <b>일일 행동 리포트</b>',
      `⏰ ${escapeHtml(report.date)}`,
    ].join('\n'),
    [
      '<b>1. 포트폴리오</b>',
      portfolioLines.join('\n') || '▸ 기록 없음',
    ].join('\n'),
    [
      '<b>2. 신규 매수 후보</b>',
      (report.newBuyCandidates || []).map(formatRecommendation).join('\n') || '▸ 없음',
    ].join('\n'),
    [
      '<b>3. 관찰 후보</b>',
      (report.watchOnlyCandidates || []).map(formatRecommendation).join('\n') || '▸ 없음',
    ].join('\n'),
    [
      '<b>4. 보유 유지</b>',
      (report.holdCandidates || []).slice(0, 5).map(item => formatPosition(item, 'hold')).join('\n') || '▸ 없음',
    ].join('\n'),
    [
      '<b>5. 축소 후보</b>',
      (report.reduceCandidates || []).map(item => formatPosition(item, 'reduce')).join('\n') || '▸ 없음',
    ].join('\n'),
    [
      '<b>6. 매도 후보</b>',
      (report.sellCandidates || []).map(item => formatPosition(item, 'sell')).join('\n') || '▸ 없음',
    ].join('\n'),
    '<i>자동 주문이 아닙니다. 실제 매매 전 손절선, 유동성, 당일 수급을 다시 확인하세요.</i>',
  ];

  return sections.join('\n\n');
}

async function sendActionReport(report) {
  const message = formatActionReport(report);
  try {
    await sendTelegramMessage(message, { channel: 'private' });
    console.log('[행동리포트] 전송 완료');
    return true;
  } catch (err) {
    console.error(`[행동리포트] 전송 실패: ${err.message}`);
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

  const signalLabel = {
    bullish: '상승 의견',
    bearish: '하락/회피 의견',
    neutral: '중립',
  };
  const convictionLabel = {
    high: '높음',
    medium: '보통',
    low: '낮음',
  };

  const lines = completed.map(({ recommendation, day, evaluation }) => {
    const icon = evaluation.signalReturnPct >= 0 ? '🔴' : '🔵';
    const ticker = recommendation.ticker ? ` ${escapeHtml(recommendation.ticker)}` : '';
    const alpha = typeof evaluation.alphaPct === 'number'
      ? ` · 초과 ${evaluation.alphaPct}%`
      : '';
    return [
      `${icon} <b>${escapeHtml(recommendation.name)}</b>${ticker} · 추천 후 ${day}일 평가`,
      `└ 실제 가격수익률 ${evaluation.returnPct}% · 방향 반영 수익률 ${evaluation.signalReturnPct}%${alpha}`,
      `└ 신호: ${escapeHtml(signalLabel[recommendation.signal] || recommendation.signal)} · 확신도: ${escapeHtml(convictionLabel[recommendation.conviction] || recommendation.conviction)}`,
    ].join('\n');
  });

  const avg = completed.reduce((sum, item) => sum + item.evaluation.signalReturnPct, 0) / completed.length;

  return [
    `📈 <b>추천 성과 평가</b>`,
    `⏰ ${now}`,
    `평균 방향 반영 수익률: <b>${avg.toFixed(2)}%</b>`,
    `방향 반영 수익률은 상승 의견은 오른 만큼, 하락/축소 의견은 내린 만큼 맞춘 성과로 계산합니다.`,
    '',
    lines.join('\n\n'),
  ].join('\n');
}

async function sendPerformanceReport(completed) {
  const message = formatPerformanceReport(completed);
  try {
    await sendTelegramMessage(message, { channel: 'private' });
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
    await sendTelegramMessage(message, { channel: 'private' });
    console.log('[거래성과] 리포트 전송 완료');
    return true;
  } catch (err) {
    console.error(`[거래성과] 전송 실패: ${err.message}`);
    return false;
  }
}

function formatPerformanceReview(review) {
  const title = review.period === 'monthly' ? '월간 성과 리뷰' : '주간 성과 리뷰';
  const rec = review.recommendationSummary || {};
  const trade = review.tradeSummary || {};
  const lab = review.performanceLab || {};
  const missed = lab.missedRecommendationQuality || {};
  const executed = lab.executedRecommendationQuality || {};
  const failures = lab.failureAnalysis || [];
  const leaders = lab.leaders || {};
  const behavior = review.behaviorReview || {};
  const tradeBehavior = behavior.tradeReview || {};
  const collector = review.collectorOps || {};
  const alerts = collector.alertEvents || {};
  const priceQuality = review.priceSourceQuality || {};
  const officialEod = priceQuality.officialEod || {};
  const priceFallback = priceQuality.fallback || {};
  const priceAttempts = priceQuality.attempts || {};
  const priceDecision = priceQuality.providerDecision || {};
  const freedom = review.freedomStatus || {};
  const notes = (review.notes || []).map(item => `▸ ${escapeHtml(item)}`);

  const fmtPct = value => (typeof value === 'number' ? `${value}%` : '데이터 부족');
  const linkedRate = typeof trade.linkedRatePct === 'number' ? `${trade.linkedRatePct}%` : '데이터 부족';
  const winRate = typeof rec.winRatePct === 'number' ? `${rec.winRatePct}%` : '데이터 부족';
  const avgSignal = fmtPct(rec.avgSignalReturnPct);
  const avgAlpha = fmtPct(rec.avgAlphaPct);
  const missedAvg = fmtPct(missed.avgSignalReturnPct);
  const executedAvg = fmtPct(executed.avgSignalReturnPct);
  const verdict = (() => {
    if (!rec.evaluated) return '추천 성과를 판단하기에는 아직 평가 완료 데이터가 부족합니다.';
    if (typeof rec.avgAlphaPct === 'number' && rec.avgAlphaPct > 0 && typeof rec.winRatePct === 'number' && rec.winRatePct >= 50) {
      return '이번 기간의 추천은 시장 대비 양호했습니다.';
    }
    if (typeof rec.avgAlphaPct === 'number' && rec.avgAlphaPct < 0) {
      return '이번 기간의 추천은 시장 대비 약했습니다. 추천 조건을 더 엄격하게 볼 필요가 있습니다.';
    }
    return '이번 기간의 추천은 혼재되어 있습니다. 승률보다 손익비와 최대낙폭을 함께 봐야 합니다.';
  })();

  const recommendationLines = [
    `▸ 추천 생성: ${rec.total ?? 0}건`,
    `▸ 평가 완료: ${rec.evaluated ?? 0}건`,
    `▸ 승률: ${winRate} - 평가 완료 추천 중 방향이 맞은 비율`,
    `▸ 평균 추천 수익률: ${avgSignal} - 추천 방향 기준 평균 성과`,
    `▸ 시장 대비 초과수익: ${avgAlpha} - KOSPI/Nasdaq 등 기준지수보다 더 잘했는지`,
  ];

  const executionLines = [
    `▸ 실제 거래: ${trade.total ?? 0}건`,
    `▸ 추천과 연결된 거래: ${trade.linked ?? 0}건 (${linkedRate})`,
    `▸ 추천을 실제로 산 경우 평균: ${executedAvg}`,
    `▸ 추천했지만 매수하지 않은 경우 평균: ${missedAvg}`,
  ];
  if (tradeBehavior.buyTrades) {
    executionLines.push(`▸ 원칙 점검: 추천 미연결 매수 ${tradeBehavior.unlinkedBuys ?? 0}건, 관찰/차단 후보 매수 ${tradeBehavior.watchOnlyBuys ?? 0}건`);
  }
  const failureLines = failures.slice(0, 4).map(item => {
    const examples = (item.examples || []).length ? ` · 예: ${(item.examples || []).join(', ')}` : '';
    return `▸ ${item.reason}: ${item.count}건 · 평균 ${fmtPct(item.avgSignalReturnPct)}${examples}`;
  });
  const sectorLines = (leaders.sectors || []).slice(0, 4).map(item => (
    `▸ ${item.key}: 평가 ${item.evaluated}건 · 승률 ${fmtPct(item.winRatePct)} · 평균 ${fmtPct(item.avgSignalReturnPct)}`
  ));
  const riskFactorLines = (leaders.riskFactors || []).slice(0, 4).map(item => (
    `▸ ${item.key}: 평가 ${item.evaluated}건 · 승률 ${fmtPct(item.winRatePct)} · 평균 ${fmtPct(item.avgSignalReturnPct)}`
  ));
  const aiVersionLines = (leaders.aiVersions || []).slice(0, 4).map(item => {
    const sample = item.sampleNote ? ` · ${item.sampleNote}` : '';
    return `▸ ${item.key}: 평가 ${item.evaluated}건 · 승률 ${fmtPct(item.winRatePct)} · 평균 ${fmtPct(item.avgSignalReturnPct)}${sample}`;
  });

  const collectorLines = collector.totalRuns ? [
    `▸ 수집 성공: ${collector.successfulRuns ?? 0}/${collector.completedRuns ?? collector.totalRuns}`,
    `▸ 실패: ${collector.failedRuns ?? 0}건`,
    `▸ 즉시 알림: ${collector.totalImmediateAlerts ?? 0}건`,
    `▸ 다이제스트 처리: 전송완료 ${alerts.sentDigest ?? 0}건 · 대기 ${alerts.pendingDigest ?? 0}건 · 실패 ${alerts.failedDigest ?? 0}건`,
    `▸ catch-up 처리: 전송완료 ${alerts.sentCatchUp ?? 0}건 · 대기 ${alerts.pendingCatchUp ?? 0}건 · 실패 ${alerts.failedCatchUp ?? 0}건`,
  ] : [];
  const priceLines = priceQuality.totalSnapshots ? [
    `▸ 가격 스냅샷: ${priceQuality.totalSnapshots ?? 0}건 / 종목 ${priceQuality.tickerCount ?? 0}개`,
    `▸ Provider 호출: ${priceAttempts.total ?? 0}건 · 실패 ${priceAttempts.failed ?? 0}건 (${priceAttempts.failureRatePct ?? 'n/a'}%) · 빈 응답 ${priceAttempts.empty ?? 0}건`,
    `▸ EOD 가격: ${priceQuality.eodSnapshots ?? 0}건, 공식 EOD 비중 ${officialEod.ratePct ?? 'n/a'}%`,
    `▸ KRX ${officialEod.krx ?? 0}건 · 공공데이터 ${officialEod.dataGoKr ?? 0}건 · KIS fallback ${priceQuality.kisEodFallback ?? 0}건`,
    `▸ Naver/Yahoo fallback: ${priceFallback.total ?? 0}건 (${priceFallback.ratePct ?? 'n/a'}%)`,
    `▸ 오래된 가격 의심: ${priceQuality.staleSnapshots ?? 0}건`,
    priceDecision.label ? `▸ 판단: ${priceDecision.label}` : '',
  ] : [];

  return [
    `🧾 <b>${title}</b>`,
    `${escapeHtml(review.startDate)} ~ ${escapeHtml(review.endDate)}`,
    '',
    `<b>한줄 판단</b>\n${escapeHtml(verdict)}`,
    freedom.goal ? `<b>경제적 자유</b>\n▸ 현재 ${formatKRW(freedom.currentNetWorth)} / 목표 ${formatKRW(freedom.goal.targetNetWorth)} (${freedom.targetProgressPct ?? 'n/a'}%)\n▸ 현재 속도 기준 예상 도달: ${escapeHtml(freedom.estimatedTargetDate || 'n/a')}` : '',
    [`<b>1. AI 추천 성과</b>`, ...recommendationLines.map(escapeHtml)].join('\n'),
    [`<b>2. 내 실행 품질</b>`, ...executionLines.map(escapeHtml)].join('\n'),
    failureLines.length > 0 ? [`<b>3. 실패 원인</b>`, ...failureLines.map(escapeHtml)].join('\n') : '',
    sectorLines.length > 0 ? [`<b>4. 섹터별 성과</b>`, ...sectorLines.map(escapeHtml)].join('\n') : '',
    riskFactorLines.length > 0 ? [`<b>5. 리스크 요인별 성과</b>`, ...riskFactorLines.map(escapeHtml)].join('\n') : '',
    aiVersionLines.length > 0 ? [`<b>6. 프롬프트/모델별 성과</b>`, ...aiVersionLines.map(escapeHtml)].join('\n') : '',
    collectorLines.length > 0 ? [`<b>7. 수집/알림 운영</b>`, ...collectorLines.map(escapeHtml)].join('\n') : '',
    priceLines.length > 0 ? [`<b>8. 가격 데이터 품질</b>`, ...priceLines.map(escapeHtml)].join('\n') : '',
    notes.length > 0 ? [`<b>9. 이번 주 점검할 것</b>`, ...notes].join('\n') : '',
    '<i>추천 수익률은 실제 계좌 수익률이 아닙니다. 추천 성과와 내 매매 성과를 분리해서 봅니다.</i>',
  ].filter(Boolean).join('\n');
}

async function sendPerformanceReview(review) {
  const message = formatPerformanceReview(review);
  try {
    await sendTelegramMessage(message, { channel: 'private' });
    console.log('[성과리뷰] 리포트 전송 완료');
    return true;
  } catch (err) {
    console.error(`[성과리뷰] 전송 실패: ${err.message}`);
    return false;
  }
}

module.exports = {
  notifyArticles, sendStockReport, sendDigest, sendPerformanceReport, sendTradePerformanceReport, sendPerformanceReview, sendActionReport, sendTelegramMessage, answerTelegramCallbackQuery, getTelegramChatId,
  formatMessage, formatStockReport, formatDigest, formatPerformanceReport, formatTradePerformanceReport, formatPerformanceReview, formatActionReport,
};
