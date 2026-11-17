#!/bin/sh
set -eu
account_auth_password="$(cat /secrets/auth-db-password)"
export GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:$account_auth_password@database:5432/accounts?sslmode=disable"
export GOTRUE_JWT_SECRET="$(cat /secrets/jwt-secret)"
unset account_auth_password
exec auth
