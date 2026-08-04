const Parser = require('rss-parser');
const POLICY_SOURCES = require('../config/policy-sources');
const { RSS_TIMEOUT_MS } = require('../utils/config');

function stripHtml(value = '') {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
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
    const timeoutMs = options.timeoutMs || RSS_TIMEOUT_MS;
    const res = await fetcher(source.url, {
      headers: { 'User-Agent': 'economic-agent/2.0 policy-radar' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText || ''}`.trim());
    const result = await parser.parseString(await res.text());
    return (result.items || []).map(normalizeRssItem);
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
      sourceResults.push({ id: source.id, ok: false, count: 0, error: result.reason?.message || String(result.reason) });
      return;
    }
    sourceResults.push({ id: source.id, ok: true, count: result.value.items.length, error: '' });
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
  normalizeRssItem,
  fetchSource,
  fetchPolicyDocuments,
};
