create table if not exists real_estate_goals (
  id text primary key,
  objective text not null,
  target_start date,
  target_end date,
  monitor_price_min_krw bigint not null,
  monitor_price_max_krw bigint not null,
  target_price_min_krw bigint not null,
  target_price_max_krw bigint not null,
  desired_mortgage_krw bigint,
  assumptions jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists real_estate_transactions (
  id text primary key,
  source text not null default 'molit_rtms',
  lawd_code text not null,
  province_name text,
  district_name text,
  neighborhood_name text,
  apartment_name text not null,
  parcel_address text,
  exclusive_area_sqm numeric,
  floor integer,
  built_year integer,
  contract_date date not null,
  price_krw bigint not null,
  cancelled boolean not null default false,
  cancellation_date date,
  dealing_type text,
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists real_estate_transactions_area_date_idx
  on real_estate_transactions(lawd_code, contract_date desc);
create index if not exists real_estate_transactions_price_date_idx
  on real_estate_transactions(price_krw, contract_date desc);
create index if not exists real_estate_transactions_complex_idx
  on real_estate_transactions(apartment_name, exclusive_area_sqm, contract_date desc);

create table if not exists real_estate_rent_transactions (
  id text primary key,
  source text not null default 'molit_rtms',
  lawd_code text not null,
  province_name text,
  district_name text,
  neighborhood_name text,
  apartment_name text not null,
  parcel_address text,
  exclusive_area_sqm numeric,
  floor integer,
  built_year integer,
  contract_date date not null,
  rent_type text not null,
  deposit_krw bigint not null,
  monthly_rent_krw bigint not null default 0,
  contract_type text,
  contract_term text,
  renewal_right_used boolean not null default false,
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists real_estate_rent_area_date_idx
  on real_estate_rent_transactions(lawd_code, contract_date desc);
create index if not exists real_estate_rent_complex_idx
  on real_estate_rent_transactions(apartment_name, exclusive_area_sqm, contract_date desc);

create table if not exists real_estate_listing_snapshots (
  id text primary key,
  captured_at timestamptz not null,
  source_kind text not null,
  source_reference text,
  lawd_code text,
  apartment_name text not null,
  exclusive_area_sqm numeric,
  floor_text text,
  asking_price_krw bigint not null,
  listing_status text not null default 'active',
  verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists real_estate_listing_complex_time_idx
  on real_estate_listing_snapshots(apartment_name, exclusive_area_sqm, captured_at desc);

create table if not exists real_estate_area_metrics (
  id text primary key,
  metric_month date not null,
  area_code text not null,
  area_name text not null,
  price_band_min_krw bigint,
  price_band_max_krw bigint,
  transaction_count integer,
  median_price_krw bigint,
  median_price_per_sqm_krw bigint,
  price_change_1m_pct numeric,
  transaction_change_1m_pct numeric,
  price_change_3m_pct numeric,
  price_change_12m_pct numeric,
  transaction_change_12m_pct numeric,
  drawdown_from_24m_high_pct numeric,
  cancellation_ratio numeric,
  jeonse_ratio numeric,
  source_cutoff_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(metric_month, area_code, price_band_min_krw, price_band_max_krw)
);

create index if not exists real_estate_area_metrics_month_idx
  on real_estate_area_metrics(metric_month desc, area_code);

create table if not exists housing_finance_snapshots (
  id text primary key,
  as_of_date date not null,
  purchase_price_krw bigint not null,
  estimated_loan_krw bigint,
  minimum_purchase_cash_krw bigint,
  estimated_monthly_payment_krw bigint,
  dsr_verification_required boolean not null default true,
  assumptions jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists housing_finance_snapshots_date_idx
  on housing_finance_snapshots(as_of_date desc, purchase_price_krw);

create table if not exists real_estate_market_indices (
  id text primary key,
  source text not null default 'reb_r_one',
  statbl_id text not null,
  period date not null,
  area_id text not null,
  area_name text not null,
  area_path text not null,
  index_value numeric not null,
  change_1m_pct numeric,
  change_3m_pct numeric,
  change_12m_pct numeric,
  drawdown_from_24m_high_pct numeric,
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique(statbl_id, period, area_id)
);

create index if not exists real_estate_market_indices_period_idx
  on real_estate_market_indices(period desc, area_id);

alter table real_estate_goals enable row level security;
alter table real_estate_transactions enable row level security;
alter table real_estate_rent_transactions enable row level security;
alter table real_estate_listing_snapshots enable row level security;
alter table real_estate_area_metrics enable row level security;
alter table housing_finance_snapshots enable row level security;
alter table real_estate_market_indices enable row level security;
alter table real_estate_area_metrics add column if not exists drawdown_from_24m_high_pct numeric;
