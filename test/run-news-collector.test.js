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
const {
  buildRelevantInstruments,
  filterImmediateAlertsByHistory,
  getImmediateEventKey,
  isImmediateAlertWorthy,
  partitionImmediateAlerts,
} = require('../src/utils/urgent-alert-policy');

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

test('splitAlerts buffers non-critical date-only DART disclosures instead of immediate alerts', () => {
  const now = new Date('2026-05-08T17:40:00+09:00');
  const result = splitAlerts([
    {
      id: 'dart-contract',
      score: 5,
      pubDate: '2026-05-08T00:00:00+09:00',
      pubDatePrecision: 'date',
      disclosure: { reportName: '단일판매ㆍ공급계약체결' },
    },
  ], { now, isCatchUpRun: false });

  assert.equal(result.immediate.length, 0);
  assert.deepEqual(result.overflow.map(article => `${article.id}:${article.alertType}`), ['dart-contract:digest']);
});

test('splitAlerts keeps critical date-only DART disclosures as immediate candidates', () => {
  const now = new Date('2026-05-08T17:40:00+09:00');
  const result = splitAlerts([
    {
      id: 'dart-halt',
      score: 5,
      pubDate: '2026-05-08T00:00:00+09:00',
      pubDatePrecision: 'date',
      disclosure: { reportName: '거래정지' },
    },
  ], { now, isCatchUpRun: false });

  assert.deepEqual(result.immediate.map(article => article.id), ['dart-halt']);
});

test('urgent policy suppresses administrative disclosures even for watched stocks', () => {
  const instruments = buildRelevantInstruments({
    portfolio: {},
    watchlist: {
      domesticMomentum: [{ symbol: '005930.KS', name: '삼성전자' }],
    },
  });
  const base = {
    score: 5,
    importanceScore: 5,
    urgencyScore: 5,
    disclosure: { corpName: '삼성전자', stockCode: '005930' },
  };

  for (const title of [
    '[공시] 삼성전자 주권매매거래정지해제 (액면병합 주권 변경상장)',
    '[공시] 삼성전자 불성실공시법인지정예고',
    '[공시] 삼성전자 불성실공시법인미지정',
  ]) {
    assert.equal(isImmediateAlertWorthy({ ...base, title }, { instruments }), false);
  }
});

test('urgent policy allows fatal disclosures only for holdings or explicit critical-alert stocks', () => {
  const instruments = buildRelevantInstruments({
    portfolio: {
      positions: [{ ticker: '005930', name: '삼성전자' }],
    },
    watchlist: {},
  });
  const fatal = {
    score: 5,
    importanceScore: 5,
    urgencyScore: 5,
    title: '[공시] 삼성전자 횡령ㆍ배임혐의발생',
    disclosure: { corpName: '삼성전자', stockCode: '005930' },
  };

  assert.equal(isImmediateAlertWorthy(fatal, { instruments }), true);
  assert.equal(isImmediateAlertWorthy({
    ...fatal,
    title: '[공시] 무관기업 횡령ㆍ배임혐의발생',
    disclosure: { corpName: '무관기업', stockCode: '123456' },
  }, { instruments }), false);

  const momentumOnly = buildRelevantInstruments({
    portfolio: {},
    watchlist: { domesticMomentum: [{ symbol: '005930.KS', name: '삼성전자' }] },
  });
  assert.equal(isImmediateAlertWorthy(fatal, { instruments: momentumOnly }), false);

  const explicitCritical = buildRelevantInstruments({
    portfolio: {},
    watchlist: { criticalAlerts: [{ symbol: '005930.KS', name: '삼성전자' }] },
  });
  assert.equal(isImmediateAlertWorthy(fatal, { instruments: explicitCritical }), true);
});

test('urgent policy keeps systemic news immediate and defers other score 5 items', () => {
  const result = partitionImmediateAlerts([
    {
      id: 'rate-cut',
      importanceScore: 5,
      urgencyScore: 5,
      title: '한국은행 기준금리 인하 결정',
    },
    {
      id: 'generic',
      importanceScore: 5,
      urgencyScore: 5,
      title: '증시 전망 속보',
    },
  ], { portfolio: {}, watchlist: {} });

  assert.deepEqual(result.immediate.map(article => article.id), ['rate-cut']);
  assert.deepEqual(result.digest.map(article => `${article.id}:${article.alertType}`), ['generic:digest']);
});

test('urgent policy does not treat a personal relevance keyword as breaking news', () => {
  assert.equal(isImmediateAlertWorthy({
    importanceScore: 5,
    urgencyScore: 5,
    title: '반도체 업황 전망 상향',
    relevanceTags: ['portfolio'],
  }), false);
});

test('urgent policy defers speculative systemic headlines', () => {
  assert.equal(isImmediateAlertWorthy({
    importanceScore: 5,
    urgencyScore: 5,
    title: '한국은행 기준금리 인하 가능성 전망',
  }), false);
  assert.equal(isImmediateAlertWorthy({
    importanceScore: 5,
    urgencyScore: 5,
    title: '한국은행 기준금리 인하 결정',
  }), true);
});

test('urgent history policy groups follow-up articles for the same event', () => {
  const now = new Date('2026-07-13T10:00:00+09:00');
  const first = {
    id: 'bok-1',
    title: '한국은행 기준금리 인하 결정',
  };
  const followUp = {
    id: 'bok-2',
    title: '금통위 기준금리 인하 발표 배경',
  };
  const result = filterImmediateAlertsByHistory([followUp], {
    now,
    dailyLimit: 2,
    dedupeHours: 24,
    history: [{
      articleId: first.id,
      eventKey: getImmediateEventKey(first),
      sentAt: '2026-07-13T09:00:00+09:00',
    }],
  });

  assert.equal(result.immediate.length, 0);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.digest[0].alertSuppressionReason, 'event_duplicate');
});

test('urgent history policy caps distinct immediate events per KST day', () => {
  const now = new Date('2026-07-13T14:00:00+09:00');
  const result = filterImmediateAlertsByHistory([{
    id: 'third',
    title: '코스피 서킷브레이커 발동',
  }], {
    now,
    dailyLimit: 2,
    history: [
      { articleId: 'one', eventKey: 'systemic:rate_decision:bok', sentAt: '2026-07-13T09:00:00+09:00' },
      { articleId: 'two', eventKey: 'disclosure:005930:fraud_breach', sentAt: '2026-07-13T11:00:00+09:00' },
    ],
  });

  assert.equal(result.sentToday, 2);
  assert.equal(result.immediate.length, 0);
  assert.equal(result.dailyCapCount, 1);
  assert.equal(result.digest[0].alertSuppressionReason, 'daily_cap');
});

test('urgent history policy does not double count the same local and remote alert', () => {
  const now = new Date('2026-07-13T14:00:00+09:00');
  const duplicateHistory = {
    eventKey: 'systemic:rate_decision:bok',
    sentAt: '2026-07-13T09:00:00+09:00',
  };
  const result = filterImmediateAlertsByHistory([{
    id: 'second-event',
    title: '코스피 서킷브레이커 발동',
  }], {
    now,
    dailyLimit: 2,
    history: [
      { ...duplicateHistory, article_id: 'same-article' },
      { ...duplicateHistory, articleId: 'same-article' },
    ],
  });

  assert.equal(result.sentToday, 1);
  assert.deepEqual(result.immediate.map(article => article.id), ['second-event']);
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

test('sent alert events suppress duplicate immediate Discord sends', () => {
  const existing = buildExistingAlertSets([
    { article_id: 'a1', alert_type: 'immediate', status: 'sent' },
    { article_id: 'a2', alert_type: 'digest', status: 'buffered' },
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
