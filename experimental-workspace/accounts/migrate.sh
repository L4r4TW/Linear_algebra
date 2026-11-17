#!/bin/bash
set -euo pipefail
export PGPASSWORD="$(cat /secrets/database-password)"
export PGHOST=database PGDATABASE=accounts PGUSER=postgres
account_backend_password="$(cat /secrets/practice-db-password)"
if [[ ! "$account_backend_password" =~ ^[a-f0-9]{64}$ ]]; then exit 1; fi
ready="$(psql -X -q -t -A -v ON_ERROR_STOP=1 -c "SELECT current_database()='accounts' AND to_regclass('auth.schema_migrations') IS NOT NULL")"
if [[ "$ready" != "t" ]]; then echo 'Real local Auth database required'; exit 1; fi
psql -X -q -v ON_ERROR_STOP=1 <<EOSQL
DO \$\$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='practice_backend') THEN CREATE ROLE practice_backend LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF;
END \$\$;
ALTER ROLE practice_backend PASSWORD '$account_backend_password';
EOSQL
unset account_backend_password
psql -X -q -v ON_ERROR_STOP=1 -f /migrations/001_runtime.sql
psql -X -q -v ON_ERROR_STOP=1 -f /migrations/002_immutable_attempts.sql
unset PGPASSWORD
