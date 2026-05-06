alter table market_snapshots
  add column if not exists return_5d_pct numeric,
  add column if not exists return_20d_pct numeric;
