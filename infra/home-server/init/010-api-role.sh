#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 \
  --set=api_password="$POSTGRES_PASSWORD" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'EOSQL'
select format(
  'create role economic_agent_api login bypassrls password %L',
  :'api_password'
)
where not exists (select 1 from pg_roles where rolname = 'economic_agent_api')
\gexec

alter role economic_agent_api with login bypassrls password :'api_password';
grant usage on schema public to economic_agent_api;
grant select, insert, update, delete on all tables in schema public to economic_agent_api;
grant usage, select on all sequences in schema public to economic_agent_api;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to economic_agent_api;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to economic_agent_api;
EOSQL
