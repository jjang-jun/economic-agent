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

create index if not exists performance_reviews_period_idx on performance_reviews(period, end_date);
