# Additive catalog and practice migrations (5.8)

Task 5.8 implements the models from [5.1](CATALOG_MODEL_AUDIT.md) through [5.7](DATABASE_DESIGN.md) as five ordered migrations in [supabase/migrations](../supabase/migrations/README.md). They have been applied to disposable fresh and legacy-upgrade PostgreSQL databases. They have not been applied to hosted Supabase or connected to the running apps.

## Migration contents

| File prefix | Adds |
| --- | --- |
| 202611160001 | Stable UUID identities and permanent aliases; immutable source versions; versioned three-level taxonomy; compatibility/activation references; principals, claims, sessions, private renderer state, drafts, attempts and parent-consistent constraints |
| 202611160002 | Import provenance, raw classification and mapping records; reviewed metadata/search documents; worker/run/target/case/bundle evidence; credentials, events, draft revisions and continuation pointers; bounded canonical feedback |
| 202611160003 | Forced RLS, narrow read RPCs, immutable published/sealed definitions, computed eligibility, publication/withdrawal CAS and legacy profile-role protection |
| 202611160004 | Idempotent bootstrap of eleven existing catalog aliases and pinned source hashes, plus a metadata-only release |
| 202611160005 | Backend-only atomic guest claim, draft CAS, submission reservation and accepted-result/token persistence functions |

The schemas are `catalog` (source/metadata/evidence), `practice_private` (ownership and private work), and `catalog_api` (allowlisted read functions). The migrations create 57 tables across the first two schemas. Search/browse and owner-history indexes support subsequent adapters; the 5.7 synthetic query-plan measurements remain historical prototype evidence.

The bootstrap allocates permanent UUIDs once, retaining all existing external IDs as aliases. It indexes eleven entries; it imports no sessions, seeds, tokens, student answers or compatibility approvals. Unknown language/difficulty/time and unrecorded PG/environment identity remain unknown. No database activation is created. This is independent of the unchanged experimental JSON catalog, which still enables six exercises.

## Requirements and application procedure

1. Inspect the intended Supabase project's PostgreSQL version, migration history, existing objects, grants, backups and API exposure. No remote project was inspected during this task. PostgreSQL 15+ is required by the DDL; the tested version is 16.16. Other versions and hosted platform integration require their own staging validation.
2. Require `auth.users`, `auth.uid()` and the `anon`, `authenticated`, `service_role` roles. The migration role needs schema/function/table creation, role creation/membership, and ownership-transfer privileges. The foundation rejects pre-existing catalog namespaces rather than overwriting them. If the authored app exists, apply its earlier role migration first.
3. Preserve existing public tables. Apply only the five new files in filename order through a tracked migration process, once per database. Each file is transactional. Never use `supabase/schema.sql` as an upgrade: it drops legacy tables. The 5.7 `database-lab/schema.sql` is also not an upgrade.
4. Inspect the resulting role grants, RLS, RPC projections, eleven aliases, source bindings and inactive deployment head before connecting services. Existing public course rows, profiles and attempts are retained. A new trigger blocks browser-role changes to `profiles.role`; ordinary owned profile edits remain available. Existing privileged role assignment remains a backend concern.
5. Configure intended API exposure explicitly in staging. Only `catalog_api` is a candidate for browser RPC exposure; keep `catalog` and `practice_private` outside exposed schemas. Never grant private tables or backend mutation functions to browser roles. Do not grant membership in `practice_api_reader` to the web authenticator/browser roles. The migration grants membership only to its migration owner for ownership administration.
6. Wire and test backend adapters separately before deployment. Existing apps still use their existing persistence and authentication. Deploying SQL alone does not switch them to these tables or enable account login.

A failed file rolls back its own transaction, not earlier successfully applied files. Resume using recorded migration history; do not rerun the foundation against populated schemas or drop schemas to bypass its drift check. The bootstrap itself can be replayed and validates stable aliases/source bindings. For rollback after adoption, disable new service writes and restore/repair from a verified backup or a forward migration; do not erase retained student/catalog history. No destructive down migration is provided.

## Access boundary

`anon` and `authenticated` receive no direct catalog/private table grants. `catalog_api.exercises` returns reviewed metadata and computed availability; unavailable entries require an explicit flag. `my_sessions` and `my_attempts` are authenticated-only and resolve ownership from `auth.uid()`, including active explicit guest claims. Suppressed/unknown scores and grading messages are redacted in the owner projection. Ordered answer pairs are owner-only and preserve repeated names and whitespace.

RPCs use a NOLOGIN reader role with no superuser/RLS bypass, limited column grants and forced row policies. Security-definer helpers have a fixed `pg_catalog` search path. All other new functions deny PUBLIC/browser execution. The service role can access private tables and backend functions; keep its credentials exclusively on the server. Service-role access is privileged and must be preceded by backend authentication/ownership checks.

The database can validate relational evidence and registered worker/run/profile/source bindings; it cannot authenticate a real verifier or prove PG was executed. Only a trusted backend may register evidence or consent/possession events. A `verified` assessment label alone does not pass computed eligibility: exact source/environment/profile/requirements, complete seed/viewport/check evidence and explicit publication are required. Failed/retried/unsupported evidence remains retained. New imports stay disabled.

Use a trusted server database connection for private transaction functions; private schemas are not exposed as browser/PostgREST RPC endpoints. The atomic functions are transaction primitives, not HTTP authorization:

- `claim_guest` requires backend-verified consent/possession event references, serializes against principal operations, rejects uncertain work and retires old credentials. It links history without copying or rebinding sessions.
- `save_draft` compares the checked baseline and expected branch revision; conflicts cannot overwrite another save.
- `begin_submission` reserves an idempotency key and ordered-pair digest under current eligibility and session generation. A second active operation is fenced.
- `finish_submission` atomically accepts the operation, appends immutable PG-provenance history, advances private renderer tokens/generation and the latest-attempt pointer. Invalid feedback or stale generations roll back the entire change. Feedback is a bounded canonical object, not raw renderer HTML or correct-answer maps. Shown message contents still require the existing reviewed rendering rules in the backend/UI.

Commit reservations before contacting PG. A lost PG response remains uncertain and must be reconciled; these functions do not guarantee exactly-once external execution or automatically retry PG. An already-produced accepted result can be privately retained after withdrawal; the next new operation rechecks availability. The service adapter must validate real Auth/guest credentials, CSRF/origin, field contracts, payload size, PG responses and operation transitions. Encryption/key management, retention/deletion jobs, HTTP/JWT testing and live account integration remain deployment work.

## Reproduce validation

From the repository root with Docker's Linux engine running:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/migration-tests/verify-migrations.ps1
```

The runner uses a digest-pinned PostgreSQL 16.16 image, an inspected `none` network, no published ports or host/application volumes, memory-backed temporary data and a fresh container removed in `finally`. It never reads `.env`, remote Supabase, actual student work or OPL/session volumes. The existing workspace and renderer need not be running.

Two databases are tested: a fresh Auth-shaped platform, and the repository's original schema/migrations/seed plus synthetic legacy profile/client-attempt rows. Test-only `auth.uid()` and platform grants simulate database Auth context; this is actual SQL role/RLS testing, not Supabase HTTP, JWT verification or a hosted migration rehearsal. The authored reset file runs only inside the disposable legacy fixture.

The checks cover fresh/upgrade application; checksum-ledger replay; actual bootstrap replay; all new tables' forced RLS; private data/function denial; authenticated cross-account isolation; suppression and ordered-pair restoration; immutable source/release/evidence boundaries; strict negative compatibility cases; publication CAS; claim consent/uncertainty/replay/credential retirement; draft baselines and real two-connection lock/CAS conflicts; idempotency and atomic token/attempt rollback; and unchanged fingerprints of six legacy tables. Legacy role escalation is denied while owned profile editing remains possible.

**134 checks pass: 63 fresh and 71 legacy-upgrade**, with real two-connection races in both databases. Final cleanup was checked; no verifier container remains. Fresh results and exact migration/test hashes are in [migration-observations.json](migration-tests/migration-observations.json). All fixtures are explicitly synthetic. Earlier renderer/browser counts are unchanged historical results; no renderer regression was run for these database-only changes.

## Next integration

Build the restartable full-library metadata importer and a server database adapter against these contracts. Import source/classification/provenance in bounded batches with checkpoints and diagnostics; retain unresolved fields and disable entries without evidence. Then connect paginated topic/search discovery and the planned home/subject-chapter-section chooser to safe metadata APIs, clearly distinguishing indexed and practice-ready counts. Connect practice/account persistence only after staged Auth/ownership/failure tests; do not silently migrate anonymous JSON sessions or relabel old client grades as renderer-verified.

Task 6 follow-up is complete in [opl-importer/README.md](opl-importer/README.md). Apply additive files 202611160006 through 202611160010 after the foundation, in order. Fresh/legacy checks now cover all ten files and 60 catalog/private tables; the original five-file foundation counts above describe 5.8. The separate local catalog contains the full pinned source inventory but is not hosted or connected to either app.

Task 7 follow-up is in [verification-pipeline/README.md](verification-pipeline/README.md). Apply files 202611160011 through 202611160019 in order after the importer migrations. All nineteen files have fresh/legacy upgrade evidence (134 checks, 70 forced-RLS catalog/private tables). Queue evidence and reviews stay private; only safe discovery RPCs are public. The original strict PG certification remains unresolved, and no hosted migration or real activation was applied.
