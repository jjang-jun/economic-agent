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

create index if not exists portfolio_cash_flows_date_idx
on portfolio_cash_flows(date, occurred_at);
