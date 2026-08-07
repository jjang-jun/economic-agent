const Parser = require('rss-parser');
const POLICY_SOURCES = require('../config/policy-sources');
const { RSS_TIMEOUT_MS } = require('../utils/config');

function numericOption(value, fallback, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

function policyFetchOptions(options = {}) {
  return {
    timeoutMs: numericOption(
      options.timeoutMs ?? process.env.POLICY_SOURCE_TIMEOUT_MS,
      Math.max(RSS_TIMEOUT_MS, 20_000),
      1_000
    ),
    retryCount: numericOption(
      options.retryCount ?? process.env.POLICY_SOURCE_RETRY_COUNT,
      2,
      0
    ),
    retryDelayMs: numericOption(
      options.retryDelayMs ?? process.env.POLICY_SOURCE_RETRY_DELAY_MS,
      750,
      0
    ),
  };
}

function wait(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

function firstCookie(headers) {
  return headers?.get?.('set-cookie')?.split(';', 1)[0] || '';
}

function isSelfRedirect(response, sourceUrl) {
  if (![301, 302, 303, 307, 308].includes(response?.status)) return false;
  const location = response.headers?.get?.('location');
  if (!location) return false;
  try {
    return new URL(location, sourceUrl).href === new URL(sourceUrl).href;
  } catch {
    return false;
  }
}

async function fetchOfficialResponse(source, fetcher, timeoutMs) {
  const headers = { 'User-Agent': 'economic-agent/2.0 policy-radar' };
  const signal = AbortSignal.timeout(timeoutMs);
  const initial = await fetcher(source.url, { headers, signal, redirect: 'manual' });
  const cookie = firstCookie(initial.headers);
  if (isSelfRedirect(initial, source.url) && cookie) {
    return fetcher(source.url, {
      headers: { ...headers, Cookie: cookie },
      signal,
      redirect: 'follow',
    });
  }
  if (initial.status >= 300 && initial.status < 400) {
    const location = initial.headers?.get?.('location');
    if (location) {
      return fetcher(new URL(location, source.url), { headers, signal, redirect: 'follow' });
    }
  }
  return initial;
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp;)?nbsp;|&#160;/gi, ' ')
    .replace(/&(?:amp;)?ldquo;/gi, '“')
    .replace(/&(?:amp;)?rdquo;/gi, '”')
    .replace(/&(?:amp;)?lsquo;/gi, '‘')
    .replace(/&(?:amp;)?rsquo;/gi, '’')
    .replace(/&(?:amp;)?middot;/gi, '·')
    .replace(/&(?:amp;)?hellip;/gi, '…')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOfficialDetailUrl(value = '') {
  try {
    const url = new URL(value);
    if (url.hostname === 'mofe.go.kr') {
      url.protocol = 'https:';
      url.hostname = 'www.mofe.go.kr';
    }
    return url.href;
  } catch {
    return '';
  }
}

function extractMetaContent(html = '', property = '') {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = String(html).match(pattern);
    if (match?.[1]) return stripHtml(match[1]);
  }
  return '';
}

function usefulDetail(value, title = '') {
  const detail = stripHtml(value);
  const detailKey = detail.replace(/[^0-9A-Za-z가-힣]/g, '');
  const titleKey = stripHtml(title).replace(/[^0-9A-Za-z가-힣]/g, '');
  if (detail.length < 50) return '';
  if (titleKey && (detailKey === titleKey || detailKey.length <= titleKey.length + 20)) return '';
  return detail.slice(0, 4_000);
}

function extractOfficialDetail(html = '', document = {}) {
  const link = normalizeOfficialDetailUrl(document.link);
  let hostname = '';
  try {
    hostname = new URL(link).hostname;
  } catch {
    return '';
  }

  if (hostname === 'www.fsc.go.kr' || hostname === 'fsc.go.kr') {
    const body = String(html).match(
      /<div[^>]+class=["']cont["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class=["']file["']/iu
    );
    const extracted = usefulDetail(body?.[1] || '', document.title);
    if (extracted) return extracted;
  }

  return usefulDetail(
    extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description'),
    document.title
  );
}

function supportsPolicyDetail(value = '') {
  try {
    const hostname = new URL(normalizeOfficialDetailUrl(value)).hostname;
    // 재정경제부는 본문 대신 HWPX/PDF 첨부만 제공하고, 국토교통부는 상세
    // 페이지에 별도 WAF가 있어 현재는 안정적으로 본문을 읽을 수 있는 FSC만 보강한다.
    return hostname === 'www.fsc.go.kr' || hostname === 'fsc.go.kr';
  } catch {
    return false;
  }
}

async function fetchPolicyEventDetail(event, options = {}) {
  if (!event?.link) return event;
  const normalizedLink = normalizeOfficialDetailUrl(event.link);
  const normalizedEvent = normalizedLink && normalizedLink !== event.link
    ? { ...event, link: normalizedLink }
    : event;
  if (!supportsPolicyDetail(normalizedLink)) return normalizedEvent;
  const fetcher = options.fetcher || fetch;
  const timeoutMs = numericOption(
    options.timeoutMs ?? process.env.POLICY_DETAIL_TIMEOUT_MS,
    12_000,
    1_000
  );
  try {
    const url = normalizedLink;
    const response = await fetchOfficialResponse({ url }, fetcher, timeoutMs);
    if (!response.ok) return normalizedEvent;
    const detail = extractOfficialDetail(await response.text(), { ...normalizedEvent, link: url });
    if (!detail || detail.length <= String(event.summary || '').length) return normalizedEvent;
    // contentHash는 RSS 변경 감지용으로 유지한다. 상세 본문은 알림 표현만 보강한다.
    return { ...normalizedEvent, summary: detail, detailSource: 'official_page' };
  } catch {
    return normalizedEvent;
  }
}

async function enrichPolicyEventDetails(events = [], options = {}) {
  const maxEvents = numericOption(
    options.maxEvents ?? process.env.POLICY_DETAIL_MAX_EVENTS,
    10,
    0
  );
  const candidates = events.slice(0, maxEvents);
  const enriched = await Promise.all(candidates.map(event => fetchPolicyEventDetail(event, options)));
  return [...enriched, ...events.slice(maxEvents)];
}

function normalizeRssItem(item = {}) {
  return {
    externalId: item.guid || item.id || item.link || '',
    title: stripHtml(item.title || ''),
    summary: stripHtml(item.contentSnippet || item.content || item.summary || item.description || ''),
    link: item.link || '',
    pubDate: item.isoDate || item.pubDate || item.date || null,
  };
}

async function fetchSource(source, options = {}) {
  if (source.format === 'rss') {
    const parser = options.parser || new Parser();
    const fetcher = options.fetcher || fetch;
    const { timeoutMs, retryCount, retryDelayMs } = policyFetchOptions(options);
    let lastError;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const res = await fetchOfficialResponse(source, fetcher, timeoutMs);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText || ''}`.trim());
        const result = await parser.parseString(await res.text());
        return (result.items || []).map(normalizeRssItem);
      } catch (error) {
        lastError = error;
        if (attempt < retryCount) await wait(retryDelayMs * (attempt + 1));
      }
    }
    throw new Error(`${lastError?.message || 'unknown error'} (${retryCount + 1}회 시도)`);
  }

  throw new Error(`unsupported policy source format: ${source.format}`);
}

async function fetchPolicyDocuments(options = {}) {
  const sources = options.sources || POLICY_SOURCES;
  const results = await Promise.allSettled(
    sources.map(async source => ({
      source,
      items: await fetchSource(source, options),
    }))
  );

  const documents = [];
  const sourceResults = [];
  results.forEach((result, index) => {
    const source = sources[index];
    if (result.status === 'rejected') {
      sourceResults.push({
        id: source.id,
        authority: source.authority,
        sourceKind: source.sourceKind,
        ok: false,
        count: 0,
        error: result.reason?.message || String(result.reason),
      });
      return;
    }
    sourceResults.push({
      id: source.id,
      authority: source.authority,
      sourceKind: source.sourceKind,
      ok: true,
      count: result.value.items.length,
      error: '',
    });
    for (const item of result.value.items) {
      documents.push({
        ...item,
        sourceId: source.id,
        authority: source.authority,
        sourceKind: source.sourceKind,
      });
    }
  });

  return { documents, sourceResults };
}

module.exports = {
  stripHtml,
  normalizeOfficialDetailUrl,
  extractOfficialDetail,
  fetchPolicyEventDetail,
  enrichPolicyEventDetails,
  normalizeRssItem,
  policyFetchOptions,
  fetchOfficialResponse,
  fetchSource,
  fetchPolicyDocuments,
};
