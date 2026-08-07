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
  ai_provider text,
  ai_model text,
  prompt_version text,
  ai_metadata jsonb,
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

create table if not exists research_candidates (
  id text primary key,
  date date not null,
  name text,
  ticker text,
  symbol text,
  signal text not null,
  conviction text,
  cohort text not null default 'shadow',
  decision_status text not null default 'rejected',
  rejection_reasons jsonb not null default '[]'::jsonb,
  market_regime text,
  ai_provider text,
  ai_model text,
  prompt_version text,
  entry jsonb,
  benchmark jsonb,
  status text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists research_candidate_evaluations (
  id text primary key,
  candidate_id text references research_candidates(id) on delete cascade,
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

create table if not exists market_anomaly_signals (
  id text primary key,
  date date not null,
  symbol text not null,
  ticker text,
  name text,
  direction text not null default 'unknown',
  score numeric,
  detected_at timestamptz not null,
  evidence_status text not null default 'unverified',
  related_article_ids jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
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

create table if not exists portfolio_cash_flows (
  id text primary key,
  date date not null,
  occurred_at timestamptz not null,
  account_id text not null default 'default:main',
  type text not null,
  amount numeric not null,
  external_amount numeric not null default 0,
  is_external boolean not null default false,
  currency text not null default 'KRW',
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

create table if not exists price_snapshots (
  id bigserial primary key,
  ticker text not null,
  symbol text,
  name text,
  market text,
  price numeric not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume numeric,
  trading_value numeric,
  currency text default '',
  source text not null,
  price_type text not null,
  is_realtime boolean default false,
  is_adjusted boolean default false,
  as_of timestamptz not null,
  collected_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique (ticker, source, price_type, as_of)
);

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

create table if not exists real_estate_goals (
  id text primary key,
  objective text not null,
  target_start date,
  target_end date,
  monitor_price_min_krw bigint not null,
  monitor_price_max_krw bigint not null,
  target_price_min_krw bigint not null,
  target_price_max_krw bigint not null,
  desired_mortgage_krw bigint,
  assumptions jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists real_estate_transactions (
  id text primary key,
  source text not null default 'molit_rtms',
  lawd_code text not null,
  province_name text,
  district_name text,
  neighborhood_name text,
  apartment_name text not null,
  parcel_address text,
  exclusive_area_sqm numeric,
  floor integer,
  built_year integer,
  contract_date date not null,
  price_krw bigint not null,
  cancelled boolean not null default false,
  cancellation_date date,
  dealing_type text,
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists real_estate_rent_transactions (
  id text primary key,
  source text not null default 'molit_rtms',
  lawd_code text not null,
  province_name text,
  district_name text,
  neighborhood_name text,
  apartment_name text not null,
  parcel_address text,
  exclusive_area_sqm numeric,
  floor integer,
  built_year integer,
  contract_date date not null,
  rent_type text not null,
  deposit_krw bigint not null,
  monthly_rent_krw bigint not null default 0,
  contract_type text,
  contract_term text,
  renewal_right_used boolean not null default false,
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists real_estate_listing_snapshots (
  id text primary key,
  captured_at timestamptz not null,
  source_kind text not null,
  source_reference text,
  lawd_code text,
  apartment_name text not null,
  exclusive_area_sqm numeric,
  floor_text text,
  asking_price_krw bigint not null,
  listing_status text not null default 'active',
  verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists real_estate_area_metrics (
  id text primary key,
  metric_month date not null,
  area_code text not null,
  area_name text not null,
  price_band_min_krw bigint,
  price_band_max_krw bigint,
  transaction_count integer,
  median_price_krw bigint,
  median_price_per_sqm_krw bigint,
  price_change_1m_pct numeric,
  transaction_change_1m_pct numeric,
  price_change_3m_pct numeric,
  price_change_12m_pct numeric,
  transaction_change_12m_pct numeric,
  drawdown_from_24m_high_pct numeric,
  cancellation_ratio numeric,
  jeonse_ratio numeric,
  source_cutoff_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(metric_month, area_code, price_band_min_krw, price_band_max_krw)
);

create table if not exists housing_finance_snapshots (
  id text primary key,
  as_of_date date not null,
  purchase_price_krw bigint not null,
  estimated_loan_krw bigint,
  minimum_purchase_cash_krw bigint,
  estimated_monthly_payment_krw bigint,
  dsr_verification_required boolean not null default true,
  assumptions jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists real_estate_market_indices (
  id text primary key,
  source text not null default 'reb_r_one',
  statbl_id text not null,
  period date not null,
  area_id text not null,
  area_name text not null,
  area_path text not null,
  index_value numeric not null,
  change_1m_pct numeric,
  change_3m_pct numeric,
  change_12m_pct numeric,
  drawdown_from_24m_high_pct numeric,
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique(statbl_id, period, area_id)
);

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
alter table real_estate_goals enable row level security;
alter table real_estate_transactions enable row level security;
alter table real_estate_rent_transactions enable row level security;
alter table real_estate_listing_snapshots enable row level security;
alter table real_estate_area_metrics enable row level security;
alter table housing_finance_snapshots enable row level security;
alter table real_estate_market_indices enable row level security;
alter table real_estate_area_metrics add column if not exists drawdown_from_24m_high_pct numeric;

create table if not exists api_token_cache (
  provider text primary key,
  access_token text not null,
  token_type text,
  expires_at timestamptz not null,
  issued_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table api_token_cache enable row level security;

create index if not exists articles_date_idx on articles(date);
create index if not exists recommendations_date_idx on recommendations(date);
create index if not exists research_candidates_date_idx on research_candidates(date);
create index if not exists research_candidates_cohort_idx on research_candidates(cohort, decision_status);
create index if not exists research_candidates_model_idx on research_candidates(ai_provider, ai_model, prompt_version);
create index if not exists research_candidate_evaluations_candidate_idx on research_candidate_evaluations(candidate_id, day);
create index if not exists market_anomaly_signals_detected_idx on market_anomaly_signals(detected_at desc);
create index if not exists market_anomaly_signals_evidence_idx on market_anomaly_signals(evidence_status, detected_at desc);
create index if not exists trade_executions_date_idx on trade_executions(date);
create index if not exists portfolio_snapshots_date_idx on portfolio_snapshots(date);
create index if not exists portfolio_cash_flows_date_idx on portfolio_cash_flows(date, occurred_at);
create index if not exists market_snapshots_captured_at_idx on market_snapshots(captured_at);
create index if not exists price_snapshots_ticker_as_of_idx on price_snapshots(ticker, as_of desc);
create index if not exists price_snapshots_source_type_idx on price_snapshots(source, price_type);
create index if not exists price_provider_attempts_provider_time_idx on price_provider_attempts(provider, attempted_at desc);
create index if not exists price_provider_attempts_status_time_idx on price_provider_attempts(status, attempted_at desc);
create index if not exists investor_flows_date_idx on investor_flows(date);
create index if not exists policy_events_event_key_idx on policy_events(event_key, published_at desc);
create index if not exists policy_events_domain_stage_idx on policy_events(domain, stage, last_seen_at desc);
create index if not exists policy_event_versions_event_idx on policy_event_versions(policy_event_id, observed_at desc);
create index if not exists performance_reviews_period_idx on performance_reviews(period, end_date);
create index if not exists financial_freedom_goals_user_date_idx on financial_freedom_goals(user_key, date);
create index if not exists portfolio_accounts_user_idx on portfolio_accounts(user_key);
create index if not exists positions_account_idx on positions(account_id);
create index if not exists risk_policy_user_idx on risk_policy(user_key);
create index if not exists conversation_messages_chat_created_idx on conversation_messages(chat_id, created_at);
create index if not exists pending_actions_chat_status_idx on pending_actions(chat_id, status);
create index if not exists collector_runs_job_status_idx on collector_runs(job_name, status, finished_at desc);
create index if not exists alert_events_status_idx on alert_events(status, alert_type, created_at);
create index if not exists worker_job_runs_job_schedule_idx on worker_job_runs(job_name, scheduled_for desc);
create index if not exists worker_job_runs_status_schedule_idx on worker_job_runs(status, scheduled_for desc);
create index if not exists worker_heartbeats_last_seen_idx on worker_heartbeats(last_seen_at desc);
create index if not exists real_estate_transactions_area_date_idx on real_estate_transactions(lawd_code, contract_date desc);
create index if not exists real_estate_transactions_price_date_idx on real_estate_transactions(price_krw, contract_date desc);
create index if not exists real_estate_transactions_complex_idx on real_estate_transactions(apartment_name, exclusive_area_sqm, contract_date desc);
create index if not exists real_estate_rent_area_date_idx on real_estate_rent_transactions(lawd_code, contract_date desc);
create index if not exists real_estate_rent_complex_idx on real_estate_rent_transactions(apartment_name, exclusive_area_sqm, contract_date desc);
create index if not exists real_estate_listing_complex_time_idx on real_estate_listing_snapshots(apartment_name, exclusive_area_sqm, captured_at desc);
create index if not exists real_estate_area_metrics_month_idx on real_estate_area_metrics(metric_month desc, area_code);
create index if not exists housing_finance_snapshots_date_idx on housing_finance_snapshots(as_of_date desc, purchase_price_krw);
create index if not exists real_estate_market_indices_period_idx on real_estate_market_indices(period desc, area_id);
