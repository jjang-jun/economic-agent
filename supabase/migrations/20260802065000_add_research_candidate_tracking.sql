create table if not exists research_candidates (
  id text primary key,
  date date not null,
  name text,
  ticker text,
  symbol text,
  signal text not null,
  conviction text,
  cohort text not null default 'shadow',
  decision_status text not null default 'rejected',
  rejection_reasons jsonb not null default '[]'::jsonb,
  market_regime text,
  ai_provider text,
  ai_model text,
  prompt_version text,
  entry jsonb,
  benchmark jsonb,
  status text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists research_candidate_evaluations (
  id text primary key,
  candidate_id text references research_candidates(id) on delete cascade,
  day integer not null,
  evaluated_at timestamptz,
  price numeric,
  return_pct numeric,
  signal_return_pct numeric,
  alpha_pct numeric,
  max_price_after numeric,
  min_price_after numeric,
  max_favorable_excursion_pct numeric,
  max_adverse_excursion_pct numeric,
  max_drawdown_pct numeric,
  stop_touched boolean,
  target_touched boolean,
  result_label text,
  benchmark jsonb,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists research_candidates_date_idx
on research_candidates(date);

create index if not exists research_candidates_cohort_idx
on research_candidates(cohort, decision_status);

create index if not exists research_candidates_model_idx
on research_candidates(ai_provider, ai_model, prompt_version);

create index if not exists research_candidate_evaluations_candidate_idx
on research_candidate_evaluations(candidate_id, day);
