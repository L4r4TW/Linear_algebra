# Repeatable OPL importer
6.1 checkpoint: isolated local database and server-only SQL adapter. No existing application, student/session volume, or hosted Supabase is used.
From the repository root:
```powershell
docker compose -f experimental-workspace/opl-importer/compose.yaml build importer
docker compose -f experimental-workspace/opl-importer/compose.yaml up -d --wait database
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm --entrypoint node importer setup-local.mjs
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm importer doctor
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm --entrypoint node importer --test db.test.mjs
```
The separate internal Docker network publishes no ports. Its local development database uses trust authentication only on that network. Do not attach untrusted services or deploy this platform fixture publicly. The database persists in linear-algebra-opl-catalog_catalog; avoid down --volumes. OPL mounts read-only; no PG files are copied to the host. The setup records transactional migration checksums and rejects drift. It does not reset existing public tables or import real Auth/session records.
6.2–6.7 add inventory, metadata, reconciliation, checkpoints, search publication and full-library verification.
