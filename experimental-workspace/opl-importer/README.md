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

## 6.2 inventory checkpoint

Run the importer inventory command (optional exact revision argument). It verifies HEAD, reads tracked regular PG blobs through Git's batch object reader, checks object hashes, and records SHA-256/source paths with a deterministic manifest. No dirty working-tree or untracked source is imported, symlinks are excluded, and read/object failures abort without a complete manifest. State stays in the separate Docker state volume. Pinned scan: 77,134 sources (40,541 OpenProblemLibrary / 29,624 Contrib / 6,969 Pending), zero PG symlinks. Synthetic tests cover dirty/untracked files, repeatability, symlinks and wrong pins. These are indexed-source counts, not playable exercises.
