const test = require('node:test');
const assert = require('node:assert/strict');
const { SERIES, buildFredUrl } = require('../src/sources/fred-api');

test('FRED CPI query requests percent change from a year ago instead of the raw index', () => {
  assert.deepEqual(SERIES.cpi_yoy, { id: 'CPIAUCSL', units: 'pc1' });

  const url = new URL(buildFredUrl(SERIES.cpi_yoy.id, 'test-key', SERIES.cpi_yoy));
  assert.equal(url.searchParams.get('series_id'), 'CPIAUCSL');
  assert.equal(url.searchParams.get('units'), 'pc1');
  assert.equal(url.searchParams.get('limit'), '1');
});
