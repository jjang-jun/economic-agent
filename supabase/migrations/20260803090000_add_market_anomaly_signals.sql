create table if not exists market_anomaly_signals (
  id text primary key,
  date date not null,
  symbol text not null,
  ticker text,
  name text,
  direction text not null default 'unknown',
  score numeric,
  detected_at timestamptz not null,
  evidence_status text not null default 'unverified',
  related_article_ids jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists market_anomaly_signals_detected_idx
on market_anomaly_signals(detected_at desc);

create index if not exists market_anomaly_signals_evidence_idx
on market_anomaly_signals(evidence_status, detected_at desc);
