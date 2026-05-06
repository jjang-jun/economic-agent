create table if not exists trade_executions (
  id text primary key,
  date date not null,
  executed_at timestamptz not null,
  side text not null,
  ticker text,
  symbol text,
  name text,
  quantity numeric,
  price numeric,
  amount numeric,
  fees numeric,
  taxes numeric,
  recommendation_id text references recommendations(id) on delete set null,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists trade_executions_date_idx on trade_executions(date);
