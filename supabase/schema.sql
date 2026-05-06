create table if not exists articles (
  id text primary key,
  date date,
  title text,
  title_ko text,
  summary text,
  link text,
  pub_date timestamptz,
  source text,
  score integer,
  sentiment text,
  finbert_confidence numeric,
  sectors jsonb default '[]'::jsonb,
  reason text,
  high_priority boolean default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists daily_summaries (
  date date primary key,
  stats jsonb not null default '{}'::jsonb,
  indicators jsonb not null default '{}'::jsonb,
  top_news jsonb not null default '[]'::jsonb,
  stock_report jsonb,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists stock_reports (
  id text primary key,
  date date not null,
  market_summary text,
  report jsonb not null,
  decision jsonb,
  created_at timestamptz not null default now()
);

create table if not exists recommendations (
  id text primary key,
  date date not null,
  name text,
  ticker text,
  symbol text,
  signal text,
  conviction text,
  reason text,
  risk text,
  invalidation text,
  risk_profile jsonb,
  entry jsonb,
  benchmark jsonb,
  status text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists recommendation_evaluations (
  id text primary key,
  recommendation_id text references recommendations(id) on delete cascade,
  day integer not null,
  evaluated_at timestamptz,
  price numeric,
  return_pct numeric,
  signal_return_pct numeric,
  alpha_pct numeric,
  benchmark jsonb,
  payload jsonb not null default '{}'::jsonb
);

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

create table if not exists market_snapshots (
  id text primary key,
  captured_at timestamptz not null,
  session text,
  name text,
  symbol text,
  price numeric,
  previous_close numeric,
  change_percent numeric,
  return_5d_pct numeric,
  return_20d_pct numeric,
  currency text,
  market_time timestamptz,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists investor_flows (
  id text primary key,
  date date not null,
  market text not null,
  individual numeric,
  foreign_net_buy numeric,
  institution_net_buy numeric,
  pension_net_buy numeric,
  unit text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists decision_contexts (
  id text primary key,
  date date not null,
  regime text,
  score integer,
  context jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists articles_date_idx on articles(date);
create index if not exists recommendations_date_idx on recommendations(date);
create index if not exists trade_executions_date_idx on trade_executions(date);
create index if not exists market_snapshots_captured_at_idx on market_snapshots(captured_at);
create index if not exists investor_flows_date_idx on investor_flows(date);
