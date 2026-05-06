alter table recommendations
  add column if not exists invalidation text,
  add column if not exists risk_profile jsonb;
