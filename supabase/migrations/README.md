# Database migration entry point

The original authored app uses `../schema.sql`, the three `20260221_*.sql` migrations and `../seed.sql`. The base schema is a destructive development reset, never an upgrade for existing data.

The additive full-library foundation consists of these files, applied once in this exact order:

1. `202611160001_catalog_and_practice_foundation.sql`
2. `202611160002_catalog_provenance_and_evidence.sql`
3. `202611160003_catalog_access_and_publication.sql`
4. `202611160004_bootstrap_existing_opl_metadata.sql`
5. `202611160005_practice_atomic_operations.sql`

Read [DATABASE_MIGRATIONS.md](../../experimental-workspace/DATABASE_MIGRATIONS.md) before applying them. It documents prerequisites, access boundaries, fresh/upgrade validation, transaction/recovery behavior and integration limits. Do not apply the legacy reset or the isolated design-lab SQL to upgrade a database. These migrations are checked in and tested locally, not deployed to a hosted project.

Each file is transactional; use tracked migration history to resume after a failure. The first rejects existing new namespaces to prevent accidental overwrites. Only the metadata bootstrap is independently replayable. Retain unknown metadata, private student state and historical evidence. Do not expose private schemas or service-role credentials to browsers.

Importer follow-up: apply 202611160006_opl_import_identity.sql after the five foundation files. This creates backend-only staging and identity reconciliation; the subsequent importer guide records workflow/publication migrations and local verification.

Next apply 202611160007_opl_import_workflow.sql for durable import staging/sealing/publication. It does not enable renderer exercises.

Then apply 202611160008_opl_search.sql, 202611160009_opl_search_guard.sql and 202611160010_opl_count_projection.sql in order. These add full-library discovery and correct generated-field/reader-column boundaries. The importer setup tracks all 20261116 migrations by filename and checksum.

All ten additive migrations now pass 134 fresh/legacy-upgrade checks. See the [completed importer guide](../../experimental-workspace/opl-importer/README.md) for the 77,134-source local import, nine test groups, full-library acceptance and deployment limits.

Task 7 adds files 202611160011 through 202611160019 in filename order for manifests, queue/fencing, sanitized results, independent reviews, immutable evidence/freshness and publication. See the [verification guide](../../experimental-workspace/verification-pipeline/README.md). Local migration history is checksum-tracked; hosted Supabase is untouched. All nineteen files pass the fresh/legacy 134-check suite; the catalog/private schemas contain 70 forced-RLS tables.
