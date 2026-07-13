const WATCHLIST = require('../config/watchlist');

const SYSTEMIC_EVENT_PATTERNS = [
  /서킷브레이커|circuit breaker/i,
  /거래소.{0,12}(전면 거래정지|폐쇄)/i,
  /기준금리.{0,20}(인상|인하|동결)|(인상|인하|동결).{0,20}기준금리/i,
  /\b(?:fed|fomc)\b.{0,40}\b(?:raises?|cuts?|holds?)\b.{0,20}\brates?\b/i,
  /전쟁.{0,10}(선포|발발)|침공|invasion|war declared/i,
  /국가부도|sovereign default|채무불이행/i,
  /비상계엄/i,
];

const SPECULATIVE_EVENT_PATTERN = /전망|예상|가능성|우려|시사|검토|촉구|forecast|expected|may\b|might\b|could\b/i;

const FORCE_CRITICAL_DISCLOSURE_PATTERNS = [
  /감사의견.{0,12}(거절|부적정)/,
  /횡령|배임/,
  /파산|부도|회생절차/,
  /상장폐지.{0,20}(결정|확정|사유발생|사유 발생|정리매매)/,
  /정리매매.{0,12}(개시|재개)/,
  /중대한 영업정지|영업 전부 정지/,
];

const ADMINISTRATIVE_DISCLOSURE_PATTERNS = [
  /거래정지해제/,
  /불성실공시법인미지정/,
  /불성실공시법인지정예고/,
  /액면병합|액면분할|주식의 병합|주식의 분할/,
  /감자 주권 변경상장|주권 변경상장/,
  /합병결정 철회/,
  /스팩|SPAC/i,
];

const CRITICAL_DISCLOSURE_PATTERNS = [
  /주권매매거래정지(?!해제|기간변경)/,
  /불성실공시법인지정(?!예고|해제|미지정)/,
  /관리종목.{0,12}지정/,
];

function normalizeTicker(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\.(KS|KQ)$/i, '');
}

function addInstrument(instruments, item = {}) {
  const ticker = normalizeTicker(item.ticker || item.symbol);
  if (ticker) instruments.tickers.add(ticker);

  const name = String(item.name || '').trim().toLowerCase();
  if (name.length >= 2) instruments.names.add(name);
}

function buildRelevantInstruments({ portfolio = {}, watchlist = WATCHLIST } = {}) {
  const instruments = {
    tickers: new Set(),
    names: new Set(),
  };

  for (const position of portfolio.positions || []) addInstrument(instruments, position);
  // 가격 관찰용 watchlist 전체를 속보 대상으로 올리지 않는다. 정말 즉시
  // 받아야 하는 종목만 별도의 criticalAlerts 그룹에 명시한다.
  for (const item of watchlist?.criticalAlerts || []) addInstrument(instruments, item);

  return instruments;
}

function articleText(article = {}) {
  return [
    article.title,
    article.summary,
    article.disclosure?.corpName,
    article.disclosure?.reportName,
  ].filter(Boolean).join(' ');
}

function isRelevantInstrument(article, instruments) {
  const stockCode = normalizeTicker(article.disclosure?.stockCode);
  if (stockCode && instruments.tickers.has(stockCode)) return true;

  const text = articleText(article).toLowerCase();
  return [...instruments.names].some(name => text.includes(name));
}

function isCriticalDisclosure(article = {}) {
  if (!article.disclosure) return false;
  const text = articleText(article);

  if (FORCE_CRITICAL_DISCLOSURE_PATTERNS.some(pattern => pattern.test(text))) return true;
  if (ADMINISTRATIVE_DISCLOSURE_PATTERNS.some(pattern => pattern.test(text))) return false;
  return CRITICAL_DISCLOSURE_PATTERNS.some(pattern => pattern.test(text));
}

function isSystemicEvent(article = {}) {
  const text = articleText(article);
  if (SPECULATIVE_EVENT_PATTERN.test(text)) return false;
  return SYSTEMIC_EVENT_PATTERNS.some(pattern => pattern.test(text));
}

function disclosureEventType(text) {
  const types = [
    ['audit_opinion', /감사의견.{0,12}(거절|부적정)/],
    ['fraud_breach', /횡령|배임/],
    ['bankruptcy', /파산|부도|회생절차/],
    ['delisting', /상장폐지|정리매매/],
    ['business_suspension', /중대한 영업정지|영업 전부 정지/],
    ['trading_halt', /주권매매거래정지/],
    ['management_issue', /관리종목/],
    ['disclosure_violation', /불성실공시법인지정/],
  ];
  return types.find(([, pattern]) => pattern.test(text))?.[0] || 'critical_disclosure';
}

function systemicEventType(text) {
  if (/서킷브레이커|circuit breaker/i.test(text)) {
    if (/코스닥|kosdaq/i.test(text)) return 'circuit_breaker:kosdaq';
    if (/코스피|kospi/i.test(text)) return 'circuit_breaker:kospi';
    if (/나스닥|nasdaq/i.test(text)) return 'circuit_breaker:nasdaq';
    return 'circuit_breaker:market';
  }
  if (/거래소.{0,12}(전면 거래정지|폐쇄)/i.test(text)) return 'exchange_closure';
  if (/기준금리|\b(?:fed|fomc)\b.{0,40}\brates?\b/i.test(text)) {
    if (/한국은행|금융통화위원회|금통위/i.test(text)) return 'rate_decision:bok';
    if (/\b(?:fed|fomc)\b|연준/i.test(text)) return 'rate_decision:fed';
    if (/\becb\b|유럽중앙은행/i.test(text)) return 'rate_decision:ecb';
    return 'rate_decision:other';
  }
  if (/전쟁|침공|invasion|war declared/i.test(text)) return 'war_or_invasion';
  if (/국가부도|sovereign default|채무불이행/i.test(text)) return 'sovereign_default';
  if (/비상계엄/i.test(text)) return 'martial_law';
  return 'systemic_event';
}

function getImmediateEventKey(article = {}) {
  const text = articleText(article);
  if (article.disclosure) {
    const instrument = normalizeTicker(article.disclosure.stockCode)
      || String(article.disclosure.corpName || '').trim().toLowerCase()
      || 'unknown';
    return `disclosure:${instrument}:${disclosureEventType(text)}`;
  }
  return `systemic:${systemicEventType(text)}`;
}

function getKSTDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function historySentAt(entry = {}) {
  return entry.sentAt || entry.sent_at || entry.createdAt || entry.created_at || null;
}

function historyEventKey(entry = {}) {
  return entry.eventKey
    || entry.immediateEventKey
    || entry.payload?.immediateEventKey
    || (entry.payload ? getImmediateEventKey(entry.payload) : '');
}

function historyIdentity(entry = {}) {
  return entry.articleId
    || entry.article_id
    || `${historyEventKey(entry)}:${historySentAt(entry) || ''}`;
}

function filterImmediateAlertsByHistory(articles = [], options = {}) {
  const now = options.now || new Date();
  const dailyLimit = Number.isFinite(options.dailyLimit) ? options.dailyLimit : 2;
  const dedupeHours = Number.isFinite(options.dedupeHours) ? options.dedupeHours : 24;
  const today = getKSTDate(now);
  const cutoff = now.getTime() - dedupeHours * 60 * 60 * 1000;
  const validHistory = (options.history || []).filter(entry => {
    const sentAt = new Date(historySentAt(entry) || 0).getTime();
    return Number.isFinite(sentAt) && sentAt > 0;
  });
  const history = [...new Map(validHistory.map(entry => [historyIdentity(entry), entry])).values()];
  const recentEventKeys = new Set(history
    .filter(entry => new Date(historySentAt(entry)).getTime() >= cutoff)
    .map(historyEventKey)
    .filter(Boolean));
  const sentToday = history.filter(entry => getKSTDate(historySentAt(entry)) === today).length;
  const remaining = Math.max(0, dailyLimit - sentToday);
  const immediate = [];
  const digest = [];
  let duplicateCount = 0;
  let dailyCapCount = 0;

  for (const article of articles) {
    const eventKey = article.immediateEventKey || getImmediateEventKey(article);
    const keyed = { ...article, immediateEventKey: eventKey };
    if (recentEventKeys.has(eventKey)) {
      duplicateCount += 1;
      digest.push({ ...keyed, alertType: 'digest', alertSuppressionReason: 'event_duplicate' });
      continue;
    }
    if (immediate.length >= remaining) {
      dailyCapCount += 1;
      digest.push({ ...keyed, alertType: 'digest', alertSuppressionReason: 'daily_cap' });
      continue;
    }
    immediate.push(keyed);
    recentEventKeys.add(eventKey);
  }

  return { immediate, digest, duplicateCount, dailyCapCount, sentToday, remaining };
}

function getPolicyThresholds() {
  return {
    minImportance: Number(process.env.IMMEDIATE_ALERT_MIN_IMPORTANCE || 5),
    minUrgency: Number(process.env.IMMEDIATE_ALERT_MIN_URGENCY || 4.5),
  };
}

function isImmediateAlertWorthy(article, options = {}) {
  const thresholds = options.thresholds || getPolicyThresholds();
  if ((article.importanceScore || 0) < thresholds.minImportance) return false;
  if ((article.urgencyScore || 0) < thresholds.minUrgency) return false;

  if (article.disclosure) {
    const instruments = options.instruments || buildRelevantInstruments(options);
    return isCriticalDisclosure(article) && isRelevantInstrument(article, instruments);
  }

  // 관심 키워드 하나만 맞는 일반 뉴스는 다이제스트로 보낸다. 즉시 알림은
  // 시장 전체에 영향을 줄 수 있는 명시적인 사건만 허용한다.
  return isSystemicEvent(article);
}

function partitionImmediateAlerts(articles = [], options = {}) {
  const immediate = [];
  const digest = [];

  for (const article of articles) {
    if (isImmediateAlertWorthy(article, options)) {
      immediate.push({ ...article, immediateEventKey: getImmediateEventKey(article) });
    }
    else digest.push({ ...article, alertType: 'digest' });
  }

  return { immediate, digest };
}

module.exports = {
  normalizeTicker,
  buildRelevantInstruments,
  isRelevantInstrument,
  isCriticalDisclosure,
  isSystemicEvent,
  getImmediateEventKey,
  filterImmediateAlertsByHistory,
  isImmediateAlertWorthy,
  partitionImmediateAlerts,
};
