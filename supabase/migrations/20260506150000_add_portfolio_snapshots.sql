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

create index if not exists portfolio_snapshots_date_idx on portfolio_snapshots(date);
