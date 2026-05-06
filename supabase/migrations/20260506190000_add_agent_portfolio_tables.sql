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

create index if not exists financial_freedom_goals_user_date_idx on financial_freedom_goals(user_key, date);
create index if not exists portfolio_accounts_user_idx on portfolio_accounts(user_key);
create index if not exists positions_account_idx on positions(account_id);
create index if not exists risk_policy_user_idx on risk_policy(user_key);
create index if not exists conversation_messages_chat_created_idx on conversation_messages(chat_id, created_at);
create index if not exists pending_actions_chat_status_idx on pending_actions(chat_id, status);
