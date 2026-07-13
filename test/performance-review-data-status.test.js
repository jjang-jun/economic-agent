const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeRecommendations, summarizeTrades } = require('../src/utils/performance-review');

test('recommendation summary preserves unavailable data status', () => {
  const summary = summarizeRecommendations([], {
    dataAvailable: false,
    persistenceAvailable: false,
    dataSource: 'unavailable',
    dataError: '503 schema cache unavailable',
  });

  assert.equal(summary.total, 0);
  assert.equal(summary.dataAvailable, false);
  assert.equal(summary.persistenceAvailable, false);
  assert.equal(summary.dataSource, 'unavailable');
  assert.equal(summary.dataError, '503 schema cache unavailable');
});

test('trade summary preserves unavailable data status', () => {
  const summary = summarizeTrades([], [], {
    dataAvailable: false,
    persistenceAvailable: false,
    dataSource: 'unavailable',
    dataError: '503 schema cache unavailable',
  });

  assert.equal(summary.total, 0);
  assert.equal(summary.dataAvailable, false);
  assert.equal(summary.dataError, '503 schema cache unavailable');
});
