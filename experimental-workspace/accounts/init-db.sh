#!/bin/bash
set -euo pipefail
account_auth_password="$(cat /secrets/auth-db-password)"
if [[ ! "$account_auth_password" =~ ^[a-f0-9]{64}$ ]]; then exit 1; fi
psql -q -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE ROLE supabase_auth_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$account_auth_password';
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
GRANT CONNECT ON DATABASE accounts TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path=auth,public;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EOSQL
unset account_auth_password
