const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchAuthorizedListingFeed, normalizeListing } = require('../src/sources/real-estate-listing-feed');
const { collectListings } = require('../scripts/collect-real-estate-listings');

test('authorized listing feed requires stable references and KRW asking prices', () => {
  assert.equal(normalizeListing({ apartmentName: 'A', askingPriceKrw: 900_000_000 }), null);
  const row = normalizeListing({ id: 'provider-1', apartmentName: 'A', askingPriceKrw: 900_000_000 }, '2026-08-06T00:00:00Z');
  assert.equal(row.asking_price_krw, 900_000_000);
  assert.equal(row.listing_status, 'active');
});

test('listing collector accepts only an authorized feed adapter and target price band', async () => {
  const feedRows = await fetchAuthorizedListingFeed({
    feedUrl: 'https://licensed.example/feed',
    now: '2026-08-06T00:00:00Z',
    fetcher: async () => ({ ok: true, json: async () => ({ listings: [
      { id: 'in', apartmentName: 'A', askingPriceKrw: 900_000_000 },
      { id: 'out', apartmentName: 'B', askingPriceKrw: 1_200_000_000 },
    ] }) }),
  });
  const result = await collectListings({ dryRun: true, fetcher: async () => feedRows });
  assert.equal(result.received, 2);
  assert.equal(result.rows.length, 1);
});
