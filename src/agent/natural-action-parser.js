const watchlist = require('../config/watchlist');
const { loadStoredPortfolio } = require('../utils/portfolio-store');
const { loadRecommendations } = require('../utils/recommendation-log');
const { normalizeCompanyName } = require('../utils/recommendation-identity');

const BUY_COMPLETION_PATTERN = /(?:샀(?:어|어요|습니다|다|음)?|매수(?:했|완료|체결|기록))/i;
const SELL_COMPLETION_PATTERN = /(?:팔았(?:어|어요|습니다|다|음)?|매도(?:했|완료|체결|기록))/i;
const CASH_STATE_PATTERN = /현금[\s\S]*(?:잔액|보유|현재|지금|있어|있습니다|이야|입니다|변경|수정|맞춰|기록)/i;

function stripDiscordMentions(text = '') {
  return String(text || '')
    .replace(/<@!?\d+>/g, ' ')
    .replace(/<@&\d+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeNaturalPortfolioAction(text = '') {
  const cleaned = stripDiscordMentions(text);
  return BUY_COMPLETION_PATTERN.test(cleaned)
    || SELL_COMPLETION_PATTERN.test(cleaned)
    || (CASH_STATE_PATTERN.test(cleaned) && parseWonAmount(cleaned) !== null);
}

function parseDecimal(value) {
  const parsed = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function koreanUnitMultiplier(unit = '') {
  return {
    억: 100_000_000,
    천만: 10_000_000,
    백만: 1_000_000,
    십만: 100_000,
    만: 10_000,
    천: 1_000,
  }[unit] || 1;
}

function parseWonAmount(text = '') {
  const match = String(text).match(/(\d[\d,]*(?:\.\d+)?)\s*(억|천만|백만|십만|만|천)?\s*원/i);
  if (!match) return null;
  const value = parseDecimal(match[1]);
  return value === null ? null : Math.round(value * koreanUnitMultiplier(match[2]));
}

function parseTradePrice(text = '') {
  const usd = String(text).match(/(?:\$\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:달러|USD))/i);
  if (usd) {
    return { price: parseDecimal(usd[1] || usd[2]), currency: 'USD' };
  }
  const price = parseWonAmount(text);
  return price === null ? null : { price, currency: 'KRW' };
}

function canonicalTicker(value = '') {
  const raw = String(value || '').trim().toUpperCase();
  return raw.replace(/\.(KS|KQ)$/, '');
}

function instrumentKey(item = {}) {
  return canonicalTicker(item.ticker || item.symbol);
}

function dedupeInstruments(instruments = []) {
  const byIdentity = new Map();
  for (const item of instruments) {
    const ticker = instrumentKey(item);
    const name = String(item.name || '').trim();
    if (!ticker) continue;
    const key = `${ticker}:${normalizeCompanyName(name)}`;
    if (!byIdentity.has(key)) byIdentity.set(key, { ticker, name, symbol: item.symbol || '' });
  }
  return [...byIdentity.values()];
}

function watchlistInstruments() {
  return dedupeInstruments(Object.values(watchlist).flatMap(items => Array.isArray(items) ? items : []));
}

async function loadNaturalActionInstruments() {
  const [portfolio, recommendations] = await Promise.all([
    loadStoredPortfolio(),
    loadRecommendations(),
  ]);
  return dedupeInstruments([
    ...watchlistInstruments(),
    ...(portfolio?.positions || []),
    ...(recommendations || []),
  ]);
}

function resolveInstrument(candidate = '', fullText = '', instruments = []) {
  const domesticTicker = String(fullText).match(/(?:^|\s|\()(\d{6}(?:\.(?:KS|KQ))?)(?=$|\s|\))/i)?.[1];
  if (domesticTicker) {
    const ticker = canonicalTicker(domesticTicker);
    const known = instruments.find(item => instrumentKey(item) === ticker);
    return { ticker, name: known?.name || '' };
  }

  const normalizedCandidate = normalizeCompanyName(candidate);
  if (!normalizedCandidate) return null;
  const exact = instruments.filter(item => normalizeCompanyName(item.name) === normalizedCandidate);
  if (exact.length === 1) return { ticker: instrumentKey(exact[0]), name: exact[0].name };

  const explicitSymbol = String(candidate).match(/(?:^|\s|\()([A-Z]{1,10})(?=$|\s|\))/)?.[1];
  if (explicitSymbol) {
    const ticker = canonicalTicker(explicitSymbol);
    const known = instruments.find(item => instrumentKey(item) === ticker);
    return { ticker, name: known?.name || '' };
  }

  const contained = instruments.filter(item => {
    const normalizedName = normalizeCompanyName(item.name);
    return normalizedName && (normalizedCandidate.endsWith(normalizedName) || normalizedName.endsWith(normalizedCandidate));
  });
  return contained.length === 1
    ? { ticker: instrumentKey(contained[0]), name: contained[0].name }
    : null;
}

function extractInstrumentCandidate(text, quantityIndex) {
  return String(text).slice(0, quantityIndex)
    .replace(/^(?:오늘|어제|방금|아까|내가|제가)\s*/g, '')
    .replace(/(?:주식|종목|을|를|은|는)$/g, '')
    .replace(/[,:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNaturalPortfolioAction(text, options = {}) {
  const cleaned = stripDiscordMentions(text);
  const instruments = options.instruments || [];

  const cashAmount = CASH_STATE_PATTERN.test(cleaned) ? parseWonAmount(cleaned) : null;
  if (cashAmount !== null) {
    return { kind: 'action', action: 'cash', command: `/cash ${cashAmount}` };
  }

  const side = BUY_COMPLETION_PATTERN.test(cleaned)
    ? 'buy'
    : SELL_COMPLETION_PATTERN.test(cleaned)
      ? 'sell'
      : '';
  if (!side) return null;

  const quantityMatch = cleaned.match(/(\d[\d,]*(?:\.\d+)?)\s*주/);
  const quantity = quantityMatch ? parseDecimal(quantityMatch[1]) : null;
  const priceInfo = parseTradePrice(cleaned);
  if (!quantity || !priceInfo?.price) {
    return {
      kind: 'clarification',
      response: '수량과 체결 단가를 함께 알려주세요. 예: `삼성전자 3주를 7만원에 샀어`',
    };
  }

  const candidate = extractInstrumentCandidate(cleaned, quantityMatch.index);
  const instrument = resolveInstrument(candidate, cleaned, instruments);
  if (!instrument) {
    return {
      kind: 'clarification',
      response: '종목을 안전하게 식별하지 못했습니다. 종목 코드를 함께 알려주세요. 예: `삼성전자(005930) 3주를 7만원에 샀어`',
    };
  }

  const metadata = [
    instrument.name,
    priceInfo.currency === 'USD' ? 'currency=USD' : '',
  ].filter(Boolean).join(' ');
  return {
    kind: 'action',
    action: side,
    command: `/${side} ${instrument.ticker} ${quantity} ${priceInfo.price}${metadata ? ` ${metadata}` : ''}`,
    instrument,
    quantity,
    price: priceInfo.price,
    currency: priceInfo.currency,
  };
}

function parseNaturalReadOnlyQuery(text = '') {
  const cleaned = stripDiscordMentions(text);
  if (/(?:거래|매매).*(?:성과|수익|손익)/i.test(cleaned)) return '/trade-performance';
  if (/(?:최근\s*)?(?:거래|매매|체결).*(?:기록|내역|목록)/i.test(cleaned)) return '/trades';
  if (/(?:추천|매수\s*후보)/i.test(cleaned)) {
    return /(?:차단|관찰|전체)/i.test(cleaned) ? '/recommendations blocked' : '/recommendations';
  }
  if (/(?:경제적\s*자유|목표.*(?:상태|진행|달성))/i.test(cleaned)) return '/goal';
  if (/(?:리스크|위험|신규\s*매수.*가능)/i.test(cleaned)) return '/risk';
  if (/(?:포트폴리오|자산\s*(?:현황|상태)|보유\s*현황|현금\s*잔액.*(?:얼마|알려|보여))/i.test(cleaned)) return '/portfolio';
  return '';
}

module.exports = {
  dedupeInstruments,
  loadNaturalActionInstruments,
  looksLikeNaturalPortfolioAction,
  parseNaturalPortfolioAction,
  parseNaturalReadOnlyQuery,
  parseTradePrice,
  parseWonAmount,
  resolveInstrument,
  stripDiscordMentions,
  watchlistInstruments,
};
