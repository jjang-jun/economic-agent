create table if not exists price_provider_attempts (
  id text primary key,
  provider text not null,
  ticker text not null,
  price_type text not null,
  status text not null,
  attempted_at timestamptz not null default now(),
  latency_ms integer,
  error_message text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists price_provider_attempts_provider_time_idx
on price_provider_attempts(provider, attempted_at desc);

create index if not exists price_provider_attempts_status_time_idx
on price_provider_attempts(status, attempted_at desc);
