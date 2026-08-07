create table if not exists worker_job_runs (
  id text primary key,
  worker_id text not null,
  job_name text not null,
  scheduled_for timestamptz not null,
  mode text not null,
  status text not null,
  attempt integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  exit_code integer,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_name, scheduled_for)
);

create table if not exists worker_heartbeats (
  worker_id text primary key,
  hostname text not null,
  platform text not null,
  mode text not null,
  version text,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  gateway_connected boolean not null default false,
  running_jobs integer not null default 0,
  queued_jobs integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table worker_job_runs enable row level security;
alter table worker_heartbeats enable row level security;

create index if not exists worker_job_runs_job_schedule_idx
  on worker_job_runs(job_name, scheduled_for desc);
create index if not exists worker_job_runs_status_schedule_idx
  on worker_job_runs(status, scheduled_for desc);
create index if not exists worker_heartbeats_last_seen_idx
  on worker_heartbeats(last_seen_at desc);
