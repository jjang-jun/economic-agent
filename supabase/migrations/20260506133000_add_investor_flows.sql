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

create index if not exists investor_flows_date_idx on investor_flows(date);
