const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateLookbackMinutes,
  isWithinLookback,
  splitAlerts,
  buildExistingAlertSets,
  filterUnsentImmediateAlerts,
  filterUnqueuedAlerts,
} = require('../src/jobs/run-news-collector');
const { isCollectorWindow } = require('../scripts/run-scheduled-news-collector');

test('calculateLookbackMinutes expands window after missed runs', () => {
  const now = new Date('2026-05-07T10:20:00+09:00');
  const lastSuccessAt = new Date('2026-05-07T08:35:00+09:00').toISOString();

  assert.equal(calculateLookbackMinutes({ now, lastSuccessAt }), 115);
});

test('splitAlerts moves stale urgent articles to catch-up', () => {
  const now = new Date('2026-05-07T10:20:00+09:00');
  const result = splitAlerts([
    {
      id: 'fresh',
      score: 5,
      pubDate: '2026-05-07T10:10:00+09:00',
    },
    {
      id: 'old',
      score: 5,
      pubDate: '2026-05-07T09:00:00+09:00',
    },
  ], { now, isCatchUpRun: false });

  assert.deepEqual(result.immediate.map(article => article.id), ['fresh']);
  assert.deepEqual(result.catchUp.map(article => article.id), ['old']);
});

test('splitAlerts treats date-only articles as catch-up in catch-up runs', () => {
  const now = new Date('2026-05-07T10:20:00+09:00');
  const result = splitAlerts([
    {
      id: 'dart-date-only',
      score: 5,
      pubDate: '2026-05-07T00:00:00+09:00',
      pubDatePrecision: 'date',
    },
  ], { now, isCatchUpRun: true });

  assert.equal(result.immediate.length, 0);
  assert.deepEqual(result.catchUp.map(article => article.id), ['dart-date-only']);
});

test('isWithinLookback keeps same-day DART date-only disclosures', () => {
  const since = new Date('2026-05-07T09:50:00+09:00');
  const article = {
    id: 'dart',
    pubDate: '2026-05-07T00:00:00+09:00',
    pubDatePrecision: 'date',
  };

  assert.equal(isWithinLookback(article, since), true);
});

test('isCollectorWindow allows KST weekday collection hours only', () => {
  assert.equal(isCollectorWindow(new Date('2026-05-07T10:20:00+09:00')), true);
  assert.equal(isCollectorWindow(new Date('2026-05-07T06:59:00+09:00')), false);
  assert.equal(isCollectorWindow(new Date('2026-05-09T10:20:00+09:00')), false);
});

test('sent alert events suppress duplicate immediate Telegram sends', () => {
  const existing = buildExistingAlertSets([
    { article_id: 'a1', alert_type: 'immediate', status: 'sent' },
    { article_id: 'a2', alert_type: 'digest', status: 'pending' },
  ]);

  assert.deepEqual(
    filterUnsentImmediateAlerts([{ id: 'a1' }, { id: 'a3' }], existing).map(article => article.id),
    ['a3']
  );
  assert.deepEqual(
    filterUnqueuedAlerts([{ id: 'a2', alertType: 'digest' }, { id: 'a3', alertType: 'digest' }], existing)
      .map(article => article.id),
    ['a3']
  );
});
