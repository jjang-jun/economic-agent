create table if not exists policy_events (
  id text primary key,
  event_key text not null,
  title text not null,
  summary text,
  domain text not null,
  domains jsonb not null default '[]'::jsonb,
  stage text not null,
  authority text not null,
  source_id text not null,
  source_url text,
  published_at timestamptz,
  mentioned_dates jsonb not null default '[]'::jsonb,
  content_hash text not null,
  last_notified_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_notified_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists policy_event_versions (
  id text primary key,
  policy_event_id text not null references policy_events(id) on delete cascade,
  content_hash text not null,
  stage text not null,
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique (policy_event_id, content_hash)
);

create index if not exists policy_events_event_key_idx
  on policy_events(event_key, published_at desc);

create index if not exists policy_events_domain_stage_idx
  on policy_events(domain, stage, last_seen_at desc);

create index if not exists policy_event_versions_event_idx
  on policy_event_versions(policy_event_id, observed_at desc);
