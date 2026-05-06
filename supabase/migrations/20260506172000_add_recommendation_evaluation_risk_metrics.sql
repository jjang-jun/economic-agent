alter table recommendation_evaluations
  add column if not exists max_price_after numeric,
  add column if not exists min_price_after numeric,
  add column if not exists max_favorable_excursion_pct numeric,
  add column if not exists max_adverse_excursion_pct numeric,
  add column if not exists max_drawdown_pct numeric,
  add column if not exists stop_touched boolean,
  add column if not exists target_touched boolean,
  add column if not exists result_label text;
