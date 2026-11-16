$ErrorActionPreference='Stop'
$catalog=Join-Path $PSScriptRoot '../opl-importer/compose.yaml'
# Local-only login: no base-table privileges, no mutation grants, no service-role membership.
$sql=@'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='discovery_home') THEN CREATE ROLE discovery_home LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT; END IF;
END $$;
GRANT anon TO discovery_home;
ALTER ROLE discovery_home SET default_transaction_read_only=on;
ALTER ROLE discovery_home SET statement_timeout='4s';
'@
$sql | docker compose -f $catalog exec -T database psql -U postgres -d opl_catalog -v ON_ERROR_STOP=1
if($LASTEXITCODE -ne 0){throw 'Discovery read-only login setup failed'}
docker compose -f (Join-Path $PSScriptRoot 'compose.yaml') up --build -d --wait --wait-timeout 180
if($LASTEXITCODE -ne 0){throw 'Discovery startup failed'}
