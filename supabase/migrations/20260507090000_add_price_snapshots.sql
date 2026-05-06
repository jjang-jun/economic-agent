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

create index if not exists price_snapshots_ticker_as_of_idx on price_snapshots(ticker, as_of desc);
create index if not exists price_snapshots_source_type_idx on price_snapshots(source, price_type);
