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
    `${s.bar} <b>[${s.label}]</b>  <b>${title}</b>`,
    originalLine,
    '',
    reason ? `💬 ${reason}` : '',
    '',
    `${source} · ${date}${tags ? ' · ' + tags : ''}`,
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
    return `${icon.bar} <b>${escapeHtml(s.name)}</b>${ticker}  [${icon.label}${conviction}]\n└ ${escapeHtml(s.reason)}${risk}`;
  });

  const actionLines = (report.action_items || []).map(item =>
    `▸ ${escapeHtml(item)}`
  );

  const sections = [
    [
      `━━━━━━━━━━━━━━━━━━`,
      `📊 <b>장 마감 종목 분석</b>`,
      `━━━━━━━━━━━━━━━━━━`,
    ].join('\n'),

    escapeHtml(report.market_summary || ''),

    [
      `── <b>섹터 동향</b> ──`,
      '',
      sectorLines.join('\n\n'),
    ].join('\n'),

    [
      `── <b>주목 종목</b> ──`,
      '',
      stockLines.join('\n\n'),
    ].join('\n'),

    [
      `── <b>내일 체크포인트</b> ──`,
      '',
      actionLines.join('\n'),
    ].join('\n'),

    [
      `━━━━━━━━━━━━━━━━━━`,
      `⏰ ${now}`,
      `<i>뉴스 기반 정보 제공이며 투자 권유가 아닙니다</i>`,
    ].join('\n'),
  ];

  return sections.join('\n\n');
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
  morning: '🌅',
  lunch: '☀️',
  close: '🔔',
  evening: '🌆',
  night: '🌙',
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
      `━━━━━━━━━━━━━━━━━━`,
      `${emoji} <b>${digest.sessionName}</b>  ${moodIcon.bar} ${moodIcon.label}`,
      `━━━━━━━━━━━━━━━━━━`,
    ].join('\n'),

    `💬 <b>${escapeHtml(digest.headline || '')}</b>`,

    sectionLines.join('\n\n'),

    numberLines.length > 0
      ? [`<b>📊 주요 수치</b>`, ...numberLines].join('\n')
      : null,

    watchLines.length > 0
      ? [`<b>👀 주목 포인트</b>`, ...watchLines].join('\n')
      : null,

    [
      `━━━━━━━━━━━━━━━━━━`,
      `📰 ${digest.articleCount}건 분석 · ⏰ ${now}`,
    ].join('\n'),
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

module.exports = {
  notifyArticles, sendStockReport, sendDigest,
  formatMessage, formatStockReport, formatDigest,
};
