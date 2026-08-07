const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isBootstrapRecent,
  selectPolicyNotifications,
  runPolicyRadar,
} = require('../src/jobs/run-policy-radar');
const {
  extractSummaryPoints,
  formatPolicyRadarReport,
  splitPolicyRadarReports,
  sendPolicyRadarReport,
} = require('../src/notify/policy-report');

function event(overrides = {}) {
  return {
    id: 'policy:1',
    eventKey: 'policy-event:1',
    contentHash: 'hash-1',
    title: 'ISA 세제개편안',
    summary: '이자·배당소득 비과세 확대',
    link: 'https://mofe.go.kr/policy/1',
    publishedAt: '2026-08-03T09:00:00+09:00',
    authority: '재정경제부',
    sourceId: 'mofe-press',
    domain: 'tax',
    domains: ['tax'],
    stage: 'government_proposal',
    stageLabel: '정부안·추진안',
    action: '확정 전 · 가입·해지·매매 보류',
    mentionedDates: [],
    ...overrides,
  };
}

test('bootstrap notification suppresses old documents but keeps recent changes', () => {
  const now = new Date('2026-08-04T03:00:00.000Z');
  const recent = event();
  const old = event({ id: 'policy:old', publishedAt: '2026-01-01T00:00:00+09:00' });
  assert.equal(isBootstrapRecent(recent, now, 72), true);
  assert.equal(isBootstrapRecent(old, now, 72), false);
  const selected = selectPolicyNotifications([recent, old], new Map(), { now, bootstrapHours: 72 });
  assert.deepEqual(selected.notify.map(item => item.id), ['policy:1']);
  assert.deepEqual(selected.baseline.map(item => item.id), ['policy:old']);
});

test('already notified content is quiet while changed content retries', () => {
  const current = event();
  const existing = new Map([[current.id, {
    ...current,
    lastNotifiedHash: current.contentHash,
  }]]);
  assert.equal(selectPolicyNotifications([current], existing).notify.length, 0);
  const changed = event({ contentHash: 'hash-2', summary: '조건 변경' });
  assert.deepEqual(selectPolicyNotifications([changed], existing).notify.map(item => item.id), ['policy:1']);
});

test('policy report exposes stage, action, official source, and partial failures', () => {
  const message = formatPolicyRadarReport({
    events: [event({ title: 'ISA <개편안>' })],
    successfulSourceCount: 2,
    sourceResults: [
      { id: 'mofe', authority: '재정경제부', sourceKind: 'official_press', ok: true },
      { id: 'molit', authority: '국토교통부', sourceKind: 'official_press', ok: false },
    ],
  });
  assert.match(message, /정부안·추진안/);
  assert.match(message, /상세 요약/);
  assert.match(message, /나에게 미치는 영향\(조건부\)/);
  assert.match(message, /세후 수익·납부세액·ISA\/절세계좌 운용 조건/);
  assert.match(message, /정부안 원문, 적용 대상·한도/);
  assert.match(message, /가입·해지·매매 보류/);
  assert.match(message, /국토교통부 보도자료/);
  assert.match(message, /정책 상태가 ‘미확정’이라는 뜻은 아니며/);
  assert.match(message, /ISA &lt;개편안&gt;/);
  assert.match(message, /https:\/\/mofe\.go\.kr\/policy\/1/);
  assert.doesNotMatch(message, /\n{3,}/);
});

test('policy summary extracts several official facts without repeating the title', () => {
  const points = extractSummaryPoints(event({
    title: 'ISA 세제개편안 발표',
    summary: 'ISA 세제개편안 발표. 비과세 한도를 확대합니다. 적용 대상은 법률 개정 과정에서 확정됩니다. 시행일은 공포 후 확인해야 합니다.',
  }));
  assert.deepEqual(points, [
    '비과세 한도를 확대합니다.',
    '적용 대상은 법률 개정 과정에서 확정됩니다.',
    '시행일은 공포 후 확인해야 합니다.',
  ]);
});

test('policy report clearly labels missing official detail instead of inventing a summary', () => {
  const message = formatPolicyRadarReport({
    events: [event({ summary: '' })],
    successfulSourceCount: 1,
    sourceResults: [{ id: 'mofe', ok: true }],
  });
  assert.match(message, /공식 RSS에 상세 요약이 없어/);
  assert.doesNotMatch(message, /혜택을 확대/);
});

test('clarification summary prioritizes the official correction over the quoted press claim', () => {
  const points = extractSummaryPoints(event({
    stage: 'official_clarification',
    summary: '언론은 보증 한도를 확대한다고 보도했습니다. □ 현재 다양한 지원 방안을 검토 중이나 구체적인 내용은 확정된 바 없음을 알려드립니다.',
  }));
  assert.match(points[0], /확정된 바 없음|확정된 바 없음을/);
});

test('long policy reports are split below Discord limits without dropping events', async () => {
  const events = Array.from({ length: 7 }, (_, index) => event({
    id: `policy:${index}`,
    title: `정책 ${index} ${'상세'.repeat(30)}`,
    summary: '적용 대상과 조건을 확인해야 합니다.'.repeat(8),
  }));
  const report = { events, successfulSourceCount: 5, sourceResults: [] };
  const parts = splitPolicyRadarReports(report, 900);
  assert.ok(parts.length > 1);
  assert.equal(parts.flatMap(part => part.events).length, events.length);
  assert.ok(parts.every(part => formatPolicyRadarReport(part).length < 1200));

  const messages = [];
  await sendPolicyRadarReport(report, {
    maxChars: 900,
    sender: async message => messages.push(message),
  });
  assert.equal(messages.length, parts.length);
  assert.match(messages[0], /1\//);
});

test('policy report routes tax and real-estate events to separate Discord channels', async () => {
  const discord = [];
  await sendPolicyRadarReport({
    events: [
      event({ id: 'tax', domain: 'tax', domains: ['tax'] }),
      event({ id: 'home', title: '주택 공급 정책', domain: 'real_estate', domains: ['real_estate'] }),
    ],
    successfulSourceCount: 2,
    sourceResults: [],
  }, {
    sender: async (message, channel) => discord.push({ message, channel }),
  });
  assert.deepEqual(discord.map(item => item.channel), ['policy_tax', 'policy_real_estate']);
  assert.match(discord[0].message, /ISA 세제개편안/);
  assert.doesNotMatch(discord[0].message, /주택 공급 정책/);
  assert.match(discord[1].message, /주택 공급 정책/);
});

test('runPolicyRadar dry run classifies official documents without writing or sending', async () => {
  const result = await runPolicyRadar({
    now: new Date('2026-08-04T03:00:00.000Z'),
    dryRun: true,
    skipLock: true,
    fetchDocuments: async () => ({
      documents: [{
        externalId: '1',
        title: '생산적금융 ISA 세제개편안 발표',
        summary: '비과세 혜택을 확대한다.',
        link: 'https://mofe.go.kr/1',
        pubDate: '2026-08-03T09:00:00+09:00',
        sourceId: 'mofe-press',
        authority: '재정경제부',
        sourceKind: 'official_press',
      }],
      sourceResults: [{ id: 'mofe-press', ok: true, count: 1 }],
    }),
    enrichEvents: async events => events.map(item => ({
      ...item,
      summary: '공식 상세 페이지에서 확인한 비과세 한도와 적용 대상입니다.',
      detailSource: 'official_page',
    })),
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].domain, 'tax');
  assert.equal(result.events[0].detailSource, 'official_page');
  assert.match(result.events[0].summary, /공식 상세 페이지/);
});
