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
  thesis text,
  target_horizon text,
  reason text,
  risk text,
  invalidation text,
  failure_reason text,
  risk_profile jsonb,
  market_profile jsonb,
  risk_review jsonb,
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
  max_price_after numeric,
  min_price_after numeric,
  max_favorable_excursion_pct numeric,
  max_adverse_excursion_pct numeric,
  max_drawdown_pct numeric,
  stop_touched boolean,
  target_touched boolean,
  result_label text,
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

create table if not exists portfolio_snapshots (
  id text primary key,
  date date not null,
  captured_at timestamptz not null,
  total_asset_value numeric,
  cash_amount numeric,
  invested_amount numeric,
  cost_basis numeric,
  unrealized_pnl numeric,
  unrealized_pnl_pct numeric,
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

create table if not exists performance_reviews (
  id text primary key,
  period text not null,
  start_date date,
  end_date date,
  recommendation_summary jsonb not null default '{}'::jsonb,
  trade_summary jsonb not null default '{}'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists financial_freedom_goals (
  id text primary key,
  user_key text not null default 'default',
  date date,
  monthly_living_cost numeric,
  annual_living_cost numeric,
  target_withdrawal_rate numeric,
  target_net_worth numeric,
  current_net_worth numeric,
  monthly_saving_amount numeric,
  target_progress_pct numeric,
  target_date date,
  estimated_target_date date,
  expected_annual_return_pct numeric,
  required_annual_return_pct numeric,
  stress jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists portfolio_accounts (
  id text primary key,
  user_key text not null default 'default',
  name text not null,
  currency text default 'KRW',
  cash_amount numeric,
  total_asset_value numeric,
  is_default boolean default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists positions (
  id text primary key,
  account_id text references portfolio_accounts(id) on delete cascade,
  ticker text,
  symbol text,
  name text,
  sector text,
  quantity numeric,
  avg_price numeric,
  current_price numeric,
  market_value numeric,
  weight numeric,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists risk_policy (
  id text primary key,
  user_key text not null default 'default',
  name text not null,
  max_single_trade_risk_pct numeric,
  max_single_position_pct numeric,
  max_sector_pct numeric,
  max_new_buy_pct numeric,
  allow_margin boolean default false,
  allow_misu boolean default false,
  allow_auto_order boolean default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists conversation_messages (
  id text primary key,
  chat_id text,
  message_id text,
  direction text,
  intent text,
  text text,
  response text,
  tools jsonb not null default '[]'::jsonb,
  data_cutoff jsonb not null default '{}'::jsonb,
  pending_action_id text,
  status text default 'recorded',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists pending_actions (
  id text primary key,
  chat_id text,
  type text not null,
  status text not null default 'pending',
  requested_payload jsonb not null default '{}'::jsonb,
  risk_review jsonb not null default '{}'::jsonb,
  confirmation_token text,
  expires_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_date_idx on articles(date);
create index if not exists recommendations_date_idx on recommendations(date);
create index if not exists trade_executions_date_idx on trade_executions(date);
create index if not exists portfolio_snapshots_date_idx on portfolio_snapshots(date);
create index if not exists market_snapshots_captured_at_idx on market_snapshots(captured_at);
create index if not exists investor_flows_date_idx on investor_flows(date);
create index if not exists performance_reviews_period_idx on performance_reviews(period, end_date);
create index if not exists financial_freedom_goals_user_date_idx on financial_freedom_goals(user_key, date);
create index if not exists portfolio_accounts_user_idx on portfolio_accounts(user_key);
create index if not exists positions_account_idx on positions(account_id);
create index if not exists risk_policy_user_idx on risk_policy(user_key);
create index if not exists conversation_messages_chat_created_idx on conversation_messages(chat_id, created_at);
create index if not exists pending_actions_chat_status_idx on pending_actions(chat_id, status);
