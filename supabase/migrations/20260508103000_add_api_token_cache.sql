create table if not exists api_token_cache (
  provider text primary key,
  access_token text not null,
  token_type text,
  expires_at timestamptz not null,
  issued_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table api_token_cache enable row level security;
