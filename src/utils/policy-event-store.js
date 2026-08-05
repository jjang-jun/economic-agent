const fs = require('fs');
const path = require('path');
const {
  isPersistenceEnabled,
  selectRows,
  upsertRows,
} = require('./persistence');

const DEFAULT_STATE_FILE = path.join(__dirname, '..', '..', 'data', 'policy-radar-state.json');

function getStateFile() {
  return process.env.POLICY_RADAR_STATE_FILE || DEFAULT_STATE_FILE;
}

function loadLocalState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getStateFile(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { events: {} };
  } catch {
    return { events: {} };
  }
}

function saveLocalState(state) {
  const file = getStateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function postgrestIn(values = []) {
  const unique = [...new Set(values.filter(Boolean).map(String))];
  return `in.(${unique.map(value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
}

function fromRow(row) {
  return {
    ...(row.payload || {}),
    id: row.id,
    eventKey: row.event_key,
    contentHash: row.content_hash,
    lastNotifiedHash: row.last_notified_hash || '',
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastNotifiedAt: row.last_notified_at,
  };
}

function policyEventTime(event = {}) {
  const value = Date.parse(event.publishedAt || event.published_at || event.lastSeenAt || event.last_seen_at || '');
  return Number.isFinite(value) ? value : 0;
}

function filterRecentPolicyEvents(events = [], options = {}) {
  const domains = new Set((options.domains || []).filter(Boolean).map(String));
  const limit = Math.max(1, Math.min(30, Number(options.limit || 8)));
  return (events || [])
    .filter(event => {
      if (domains.size === 0) return true;
      const eventDomains = [event.domain, ...(event.domains || [])].filter(Boolean).map(String);
      return eventDomains.some(domain => domains.has(domain));
    })
    .sort((a, b) => policyEventTime(b) - policyEventTime(a))
    .slice(0, limit);
}

async function loadRecentPolicyEvents(options = {}) {
  const limit = Math.max(1, Math.min(30, Number(options.limit || 8)));
  if (!isPersistenceEnabled()) {
    const state = loadLocalState();
    return {
      events: filterRecentPolicyEvents(Object.values(state.events || {}), options),
      source: 'local',
      error: '',
    };
  }

  const result = await selectRows('policy_events', {
    select: '*',
    order: 'published_at.desc.nullslast,last_seen_at.desc',
    limit: String(Math.max(limit * 4, 20)),
  });
  if (result.error || !Array.isArray(result.rows)) {
    const state = loadLocalState();
    const localEvents = filterRecentPolicyEvents(Object.values(state.events || {}), options);
    return {
      events: localEvents,
      source: localEvents.length > 0 ? 'local_fallback' : 'unavailable',
      error: result.error?.message || '정책 이벤트 응답 없음',
    };
  }
  return {
    events: filterRecentPolicyEvents(result.rows.map(fromRow), options),
    source: 'supabase',
    error: '',
  };
}

async function loadPolicyEventState(events = []) {
  if (!isPersistenceEnabled()) {
    const state = loadLocalState();
    return {
      byId: new Map(Object.entries(state.events || {})),
      source: 'local',
    };
  }

  const ids = events.map(event => event.id);
  if (ids.length === 0) return { byId: new Map(), source: 'supabase' };
  const result = await selectRows('policy_events', {
    select: '*',
    id: postgrestIn(ids),
    limit: String(Math.max(ids.length, 1)),
  });
  if (result.error || !Array.isArray(result.rows)) {
    throw new Error(`정책 이벤트 조회 실패: ${result.error?.message || '응답 없음'}`);
  }
  return {
    byId: new Map(result.rows.map(row => [row.id, fromRow(row)])),
    source: 'supabase',
  };
}

function eventRow(event, previous = {}, now = new Date().toISOString()) {
  return {
    id: event.id,
    event_key: event.eventKey,
    title: event.title,
    summary: event.summary || '',
    domain: event.domain,
    domains: event.domains || [],
    stage: event.stage,
    authority: event.authority,
    source_id: event.sourceId,
    source_url: event.link || '',
    published_at: event.publishedAt || null,
    mentioned_dates: event.mentionedDates || [],
    content_hash: event.contentHash,
    last_notified_hash: previous.lastNotifiedHash || null,
    first_seen_at: previous.firstSeenAt || now,
    last_seen_at: now,
    last_notified_at: previous.lastNotifiedAt || null,
    payload: event,
  };
}

async function savePolicyEvents(events = [], existingById = new Map(), options = {}) {
  const now = options.now || new Date().toISOString();
  if (!isPersistenceEnabled()) {
    const state = loadLocalState();
    state.events ||= {};
    for (const event of events) {
      const previous = existingById.get(event.id) || state.events[event.id] || {};
      state.events[event.id] = {
        ...event,
        firstSeenAt: previous.firstSeenAt || now,
        lastSeenAt: now,
        lastNotifiedHash: previous.lastNotifiedHash || '',
        lastNotifiedAt: previous.lastNotifiedAt || null,
      };
    }
    saveLocalState(state);
    return { saved: events.length, source: 'local' };
  }

  const rows = events.map(event => eventRow(event, existingById.get(event.id), now));
  const saved = await upsertRows('policy_events', rows, 'id');
  if (saved.error) throw new Error(`정책 이벤트 저장 실패: ${saved.error.message}`);
  const versions = events.map(event => ({
    id: `${event.id}:${event.contentHash.slice(0, 16)}`,
    policy_event_id: event.id,
    content_hash: event.contentHash,
    stage: event.stage,
    observed_at: now,
    payload: event,
  }));
  const versionResult = await upsertRows('policy_event_versions', versions, 'policy_event_id,content_hash');
  if (versionResult.error) throw new Error(`정책 버전 저장 실패: ${versionResult.error.message}`);
  return { saved: events.length, source: 'supabase' };
}

async function markPolicyEventsNotified(events = [], existingById = new Map(), options = {}) {
  const now = options.now || new Date().toISOString();
  if (!isPersistenceEnabled()) {
    const state = loadLocalState();
    state.events ||= {};
    for (const event of events) {
      const previous = state.events[event.id] || existingById.get(event.id) || event;
      state.events[event.id] = {
        ...previous,
        ...event,
        lastNotifiedHash: event.contentHash,
        lastNotifiedAt: now,
        lastSeenAt: now,
      };
    }
    saveLocalState(state);
    return { saved: events.length, source: 'local' };
  }

  const rows = events.map(event => ({
    ...eventRow(event, existingById.get(event.id), now),
    last_notified_hash: event.contentHash,
    last_notified_at: now,
  }));
  const result = await upsertRows('policy_events', rows, 'id');
  if (result.error) throw new Error(`정책 알림 상태 저장 실패: ${result.error.message}`);
  return { saved: events.length, source: 'supabase' };
}

function pendingPolicyEvents(events = [], existingById = new Map()) {
  return events.filter(event => {
    const previous = existingById.get(event.id);
    if (!previous) return true;
    return previous.contentHash !== event.contentHash
      || previous.lastNotifiedHash !== event.contentHash;
  });
}

module.exports = {
  filterRecentPolicyEvents,
  getStateFile,
  loadLocalState,
  loadRecentPolicyEvents,
  saveLocalState,
  loadPolicyEventState,
  savePolicyEvents,
  markPolicyEventsNotified,
  pendingPolicyEvents,
};
