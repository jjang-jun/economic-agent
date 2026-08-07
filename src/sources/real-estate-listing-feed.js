const crypto = require('crypto');

function normalizeListing(row = {}, capturedAt = new Date().toISOString()) {
  const askingPriceKrw = Number(row.askingPriceKrw ?? row.asking_price_krw);
  const apartmentName = String(row.apartmentName ?? row.apartment_name ?? '').trim();
  const sourceReference = String(row.sourceReference ?? row.source_reference ?? row.id ?? '').trim();
  if (!apartmentName || !Number.isFinite(askingPriceKrw) || askingPriceKrw <= 0 || !sourceReference) return null;
  const capturedDate = capturedAt.slice(0, 10);
  const id = `listing:${crypto.createHash('sha256').update([
    capturedDate, sourceReference, apartmentName, askingPriceKrw,
  ].join('|')).digest('hex').slice(0, 32)}`;
  return {
    id,
    captured_at: capturedAt,
    source_kind: String(row.sourceKind ?? row.source_kind ?? 'authorized_feed'),
    source_reference: sourceReference,
    lawd_code: String(row.lawdCode ?? row.lawd_code ?? '') || null,
    apartment_name: apartmentName,
    exclusive_area_sqm: Number(row.exclusiveAreaSqm ?? row.exclusive_area_sqm) || null,
    floor_text: String(row.floorText ?? row.floor_text ?? '') || null,
    asking_price_krw: Math.round(askingPriceKrw),
    listing_status: String(row.listingStatus ?? row.listing_status ?? 'active'),
    verified: row.verified === true,
    payload: row,
  };
}

async function fetchAuthorizedListingFeed(options = {}) {
  const feedUrl = options.feedUrl || process.env.REAL_ESTATE_LISTING_FEED_URL;
  if (!feedUrl) throw new Error('REAL_ESTATE_LISTING_FEED_URL is required');
  const url = new URL(feedUrl);
  if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Listing feed must use HTTPS or a loopback URL');
  }
  const token = options.token || process.env.REAL_ESTATE_LISTING_FEED_TOKEN;
  const response = await (options.fetcher || fetch)(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(Number(options.timeoutMs || process.env.REAL_ESTATE_REQUEST_TIMEOUT_MS || 20_000)),
  });
  if (!response.ok) throw new Error(`Listing feed request failed: ${response.status}`);
  const payload = await response.json();
  const sourceRows = Array.isArray(payload) ? payload : payload.listings;
  if (!Array.isArray(sourceRows)) throw new Error('Listing feed response must be an array or { listings: [] }');
  const capturedAt = new Date(options.now || Date.now()).toISOString();
  return sourceRows.map(row => normalizeListing(row, capturedAt)).filter(Boolean);
}

module.exports = { fetchAuthorizedListingFeed, normalizeListing };
