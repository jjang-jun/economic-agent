const test = require('node:test');
const assert = require('node:assert/strict');
const { assertRebResponse, enrichRebIndexChanges, fetchRebMonth, normalizeRebIndex } = require('../src/sources/reb-real-estate');

function raw(period, areaId, areaPath, value) {
  return {
    STATBL_ID: 'A_2024_00045', WRTTIME_IDTFR_ID: period,
    CLS_ID: areaId, CLS_NM: areaPath.split('>').at(-1), CLS_FULLNM: areaPath,
    DTA_VAL: value,
  };
}

test('R-ONE normalizer keeps only Seoul and Gyeonggi apartment index rows', () => {
  assert.equal(normalizeRebIndex(raw('202507', '500008', '서울', 100)).area_path, '서울');
  assert.equal(normalizeRebIndex(raw('202507', '500011', '부산', 100)), null);
});

test('R-ONE history calculates annual change and 24 month drawdown', () => {
  const rows = Array.from({ length: 13 }, (_, index) => normalizeRebIndex(
    raw(`${2025 + Math.floor((index + 1) / 12)}${String(((index + 1) % 12) + 1).padStart(2, '0')}`, '500008', '서울', 100 + index),
  ));
  enrichRebIndexChanges(rows);
  assert.equal(rows.at(-1).change_12m_pct, 12);
  assert.equal(rows.at(-1).drawdown_from_24m_high_pct, 0);
});

test('R-ONE fetcher uses official table, monthly cycle, key, and pagination', async () => {
  let requested;
  const rows = await fetchRebMonth('202507', {
    key: 'secret',
    fetcher: async url => {
      requested = url;
      return { ok: true, json: async () => ({ SttsApiTblData: [
        { head: [{ list_total_count: 1 }, { RESULT: { CODE: 'INFO-000' } }] },
        { row: [raw('202507', '500008', '서울', 100)] },
      ] }) };
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(requested.searchParams.get('STATBL_ID'), 'A_2024_00045');
  assert.equal(requested.searchParams.get('DTACYCLE_CD'), 'MM');
  assert.equal(requested.searchParams.get('KEY'), 'secret');
});

test('R-ONE errors fail closed instead of becoming an empty market', () => {
  assert.throws(() => assertRebResponse({ SttsApiTblData: [{ head: [{ RESULT: { CODE: 'ERROR-300', MESSAGE: 'invalid key' } }] }] }), /invalid key/);
});

test('R-ONE unpublished months are a valid empty result', async () => {
  const rows = await fetchRebMonth('202607', {
    key: 'secret',
    fetcher: async () => ({ ok: true, json: async () => ({ RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } }) }),
  });
  assert.deepEqual(rows, []);
});
