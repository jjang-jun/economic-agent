alter table recommendations
  add column if not exists thesis text,
  add column if not exists target_horizon text,
  add column if not exists failure_reason text;
