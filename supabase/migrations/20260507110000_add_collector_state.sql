create table if not exists collector_runs (
  id text primary key,
  job_name text not null,
  trigger_source text not null,
  scheduled_at timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  lookback_minutes integer,
  rss_fetched_count integer default 0,
  dart_fetched_count integer default 0,
  new_article_count integer default 0,
  immediate_alert_count integer default 0,
  digest_buffer_count integer default 0,
  error_message text,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists source_cursors (
  source_name text primary key,
  last_success_at timestamptz,
  last_seen_published_at timestamptz,
  last_seen_external_id text,
  updated_at timestamptz not null default now()
);

create table if not exists alert_events (
  id text primary key,
  article_id text not null,
  alert_type text not null,
  sent_at timestamptz,
  telegram_message_id text,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (article_id, alert_type)
);

create table if not exists job_locks (
  job_name text primary key,
  locked_until timestamptz not null,
  locked_by text,
  updated_at timestamptz not null default now()
);

create index if not exists collector_runs_job_status_idx
  on collector_runs(job_name, status, finished_at desc);

create index if not exists alert_events_status_idx
  on alert_events(status, alert_type, created_at);
