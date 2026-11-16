# Database constraints and query patterns (task 5.7)

Defined 2026-11-16 after student/privacy model `a62617a`. This is a concrete relational/index/query design, backed by a guarded PostgreSQL laboratory. It is **not a Supabase migration**. No existing application, hosted database, OPL volume, session volume or live account was changed. Task 5.8 will implement and validate additive migrations against the actual target platform.

## Artifacts and validation scope

- [schema.sql](catalog-model/database-lab/schema.sql): executable prototype in **model_lab**, protected by an exact disposable database name and session marker. It never creates/modifies public or auth schema tables.
- [fixtures.sql](catalog-model/database-lab/fixtures.sql): 100,000 synthetic metadata documents, 20,004 synthetic sessions and small ownership/grading examples. All source paths, hashes, identities and scores are fabricated test data; no PG files are executed and no student records are read.
- [checks.sql](catalog-model/database-lab/checks.sql): positive/negative integrity, publication, query, privacy and retained-history checks.
- [queries.sql](catalog-model/database-lab/queries.sql): six parameterized query contracts parsed and executed against the prototype.
- [race-a.sql](catalog-model/database-lab/race-a.sql), [race-b.sql](catalog-model/database-lab/race-b.sql): coordinated independent connections proving a stale draft writer cannot overwrite a committed revision.
- [observations](catalog-model/database-design-observations.json) and [query plans](catalog-model/database-query-plans.json): sanitized real PostgreSQL results, engine/image identity, SQL hashes and natural EXPLAIN ANALYZE plans. These are lab results, not renderer compatibility or deployed Supabase RLS certification.

Production schema boundary: shared catalog/import/evidence records belong in an explicitly managed **catalog** schema; private ownership, credentials, sets, sessions, operations, attempts and drafts belong in **practice_private**. Safe catalog/owner DTOs are deliberate API projections. Do not automatically expose either base schema through a public database API, and do not replace the legacy public.exercises/attempts/course hierarchy. The laboratory maps critical table shapes into model_lab only; it is not the complete production schema or an idempotent migration.

## Keys, types and referential rules

Use permanent opaque UUID exercise/topic/principal identities and namespaced legacy aliases from [5.2](EXERCISE_IDENTITY.md). Production allocation is random/persisted, not derived from a path/hash/title. The lab's deterministic gid function exists only to generate reproducible synthetic fixtures.

Raw source paths and scoped slugs use explicit case-sensitive ordering where identity requires it. File SHA-256 values are lower-case 64-hex digests; Git OIDs carry their algorithm and full 40/64-hex length. Timestamps are timestamptz, revisions/ordinals/generations are nonnegative bigint, scores are numeric fractions with explicit nullable/visibility semantics. Localized metadata does not supply a source language or difficulty by default.

PostgreSQL CHECK constraints do not establish cross-table ownership, and nullable composite foreign keys can skip checks. Use NOT NULL, composite unique targets/FKs and explicit binding checks together. Root sibling uniqueness uses UNIQUE NULLS NOT DISTINCT so null parents do not permit duplicate root slugs. These semantics are documented in [PostgreSQL's constraint reference](https://www.postgresql.org/docs/16/ddl-constraints.html); the lab verifies the relevant edge cases.

| Record/group | Primary / unique keys | Foreign keys, checks and deletion behavior |
| --- | --- | --- |
| repositories / snapshots | UUID PK; repository registry key unique; snapshot unique(repository, object format, commit OID) | Repository FK RESTRICT; algorithm/OID length consistency. Changing a remote URL does not merge repository identity. |
| exercises / aliases | Exercise UUID PK; alias PK(namespace, external ID) | Alias target FK RESTRICT and immutable target; never recycle. Exercise provider explicit. Deleting catalog/course data cannot cascade into source or student history. |
| source_versions | UUID PK; unique(snapshot, canonical path); unique(exercise, snapshot) | FK to snapshot/exercise; traversal/backslash/control/empty-component rules; immutable source tuple. Same hash at different paths is allowed and does not deduplicate identities. Composite unique(id, exercise, snapshot) supports safe downstream binding. |
| topic memberships | PK(release, node, locale); unique siblings by release/parent/locale/slug and position, including root nulls | Node/kind FK; parent FK includes release, locale and required preceding kind. Subject → chapter → section levels prohibit cycles and orphan ancestry. Kind is an identity invariant; released presentation changes create a new release. |
| exercise-topic assignments | PK(release, source version, node, locale); partial unique primary(release, source version, locale) | Assignment FK must target a section, not a subject/chapter. Source/exercise tuple FK prevents assigning another source as this exercise. Deferred group check requires exactly one primary if assignments remain; zero assignments remains valid. |
| environments / profiles / requirement_sets | UUID PK; immutable content digest; requirement unique(source version, digest) | Environment binds an exact source snapshot. Profile version label is not enough without content identity. Requirements reference the exact source version. |
| assessments / activation members | Assessment UUID; member PK(release, exercise) | Composite FKs pin assessment/source/environment/profile/requirements/status and source snapshot. A verified member cannot point to a failed assessment, another file's requirements or a different environment. This does not prove PG evidence completeness by SQL alone. |
| deployment_heads | PK(deployment scope), generation, active publication pointer | Scope/release FK; nonnull pointer when active; publication is a CAS-protected transaction. Withdrawal changes current access, not old evidence or source rows. |
| principals / claims | Principal UUID; one account principal per verified account UUID; claim PK(anonymous principal) | Kind/account-nullability check; claim endpoints FK to anonymous/account kinds. Target is immutable and ordinary deletion forbidden; revocation is retained state. Synthetic accounts stand in for auth.users in the lab only. |
| sessions | UUID PK; composite unique(id, owner), (id, owner, exercise), and pinned identity tuples | Owner/exercise nonnull; pinned requires version/environment/snapshot, legacy-unbound requires these pins null. Independent nonnull parent/exercise FKs remain effective when source pins are null. Normal owner/exercise/source rebinding is forbidden. |
| practice sets / items | Set UUID; item PK(set, ordered position) | Set/owner FK, source/exercise/snapshot/environment FKs, optional session FK with the same owner and pins. Null session means not started, not permission to omit source selection. Once attached, a session cannot be silently detached/replaced. |
| renderer_state | Session FK/PK; private generation | Backend-only private seed/tokens; seed range checked. Session/generation atomicity is enforced by the grading transaction, not by a public owner-readable column. |
| submission_operations | UUID PK; unique(session, idempotency key); partial unique active operation(session) | Owner/session FK; key length/digest/base generation/state checks. Queued, in-flight and uncertain states fence another operation. Same-key payload comparison is a transactional decision, not an upsert that overwrites the digest. |
| accepted attempts | UUID PK; unique(session, ordinal), operation ID unique | Independent owner/session/exercise FK plus source-binding FKs. New server-PG provenance requires pinned source, an accepted operation and a valid private score. Legacy/client provenance stays explicit. Immutable accepted rows; nullable pins cannot bypass parent exercise identity. |
| drafts | UUID PK; unique(session, branch key), revision, optional checked baseline | Owner/session FK and optional baseline-attempt FK to that same session/owner. Old baselines can be retained as work; saving requires an additional locked CAS/baseline comparison. |
| bookmarks | PK(owner principal, exercise) | Owner/exercise RESTRICT; account view unions claimed/native owners and deduplicates exercise identities. Claim does not duplicate attempts or rewrite bookmarks. |
| search_documents | Scope/revision, exercise and locale uniqueness; indexed approved text vector | Separate display metadata from raw PG/answers. The lab materializes only a playable publication; full-library indexed metadata must also exist independently of activation, as described below. |

RESTRICT is the normal-operation default; absence/withdrawal and retirement use explicit state/events, not deletion. Private-data erasure/export needs a separately authorized retention workflow: immutable-history guards are not an excuse to ignore account deletion. Task 5.8 must implement that route/grant policy deliberately rather than drop guards or cascade catalog deletion through student records.

## Remaining record groups: concrete production keys

The lab concentrates on the most failure-prone constraints and query shapes. These additional groups from 5.1–5.6 are part of the production design, **not already implemented by the lab subset**:

| Production group | Required keys and integrity contract |
| --- | --- |
| Import runs, targets and source-location history | Run UUID/request idempotency key; immutable snapshot/scope/manifest/scanner identities. Target PK(run, canonical path). Registry PK(repository, path) with assignment generation; append-only identity/presence events. Only complete relevant-scope runs can propose absence. Repeated runs do not allocate replacement exercises. |
| Raw taxonomy and classification | Vocabulary UUID unique(snapshot, file path, file hash, parser version). Declaration occurrence key(source version, parser version, field, ordinal) with raw text/line and no mandatory complete triple. Assessment UUID binds vocabulary/parser/source versions and retains malformed/partial/unmapped states. |
| Metadata candidates and publication | Candidate UUID/source-version FK with field/locale/origin/value/review state; append-only review events. Selection unique(metadata revision, exercise, source version, locale, field), pointing to an approved applicable candidate or explicit omission. Metadata revisions and overrides survive reimports. |
| Full-library metadata/search projection | Document unique(metadata revision, exercise, source version, locale), with independent source/exercise FKs. Index unverified but reviewed-for-display entries too. Default playable view joins current activation/source bindings; explicit indexed view returns safe unavailable labels. Do not require activation merely to index a file. |
| Capabilities, profiles and required dimensions | Versioned capability keys; profile-capability unique(profile, capability version); required seed/viewport combination PK(profile, seed, viewport), check definition PK(profile, check key). Requirement membership unique(requirement set, capability version). Unknown requirements cannot produce approval. |
| Verification runs, attempts and evidence bundles | Immutable target manifest/digest; target case key(run, source version, required seed, viewport); case-attempt unique(case, attempt ordinal). Bundle selection unique(bundle, source version, seed, viewport), FKs carrying source/profile/environment/requirements identity. Preserve failed retries and supersession reason. Complete coverage/no-limit certification still uses trusted validation, not an unsafe CHECK over other rows. |
| Activation and policy history | Release/member immutable pins, actor/reason/time events and scoped publication generation. Keep rights/source-presence/operational revocations separately. Rechecking the trusted assessor/current policy remains mandatory on list/start/restore/grade. |
| Credentials, claim proof/events and generations | Backend-only credential hash record; one immutable anonymous/account target per claim with retained revocation. Consent/proof event IDs and ownership generation are transactional. Hash/credential rows are never browser-selectable and account role changes are privileged. |
| Draft revisions, continuation and aggregate caches | Revision history key(branch, revision), parent owner/version consistent; mutable pointer updated by CAS. Continue pointer FK to owned set/item/session. Progress cache keyed(owner scope, taxonomy/publication, policy version) and invalidated on accepted attempts, claims, visibility and publication changes. |

This is a bounded design rather than a claim to have deployed all these tables. Task 5.8 must fill the remaining DDL, immutable-publication guards, permission/RLS policies, migration ordering/backfill and full database tests before app integration. No lab helper, synthetic role or schema-reset file is a production migration.

## Query contracts and indexes

All identity/owner/publication arguments come from trusted backend resolution. Knowing an account UUID, source ID or cursor is not authorization. The lab's owned_principals(account UUID) is a private parameterized helper, explicitly not executable by the browser role; it does not validate Supabase authentication.

| User/operator need | Query shape and pagination | Supporting index / limit |
| --- | --- | --- |
| Resolve legacy exercise/source | Exact alias namespace/key → stable identity; select pinned source version, never latest-path fallback | Alias PK, unique source snapshot/path and exercise/snapshot indexes already supplied by constraints; avoid redundant copies. |
| Browse a topic/catalog page | Published metadata/current activation; EXISTS assignment predicate avoids M2M duplicates; order(title sort key COLLATE C, exercise UUID) | B-tree(scope/revision, locale, sort key, exercise). Keyset greater-than cursor, page 1–100. No deep OFFSET or whole-library download. |
| Search approved metadata | Bound normalized query, AND word prefixes, approved title/terms/topics/description only; rank descending, identity ascending | Stored weighted tsvector with GIN; match first, rank/sort matching rows afterward. GIN is not a rank-order index. |
| Home/chooser counts | Distinct exercise identities within selected subtree/current eligibility; separate indexed/playable counts | Assignment index(release, node, locale, exercise, source version), publication-member key. Never sum cross-listed child totals into a root count. Cache with explicit release/generation keys if measured necessary. |
| Continue/recent work | Resolve native plus active claimed principals; owner-scoped sessions, order(updated_at DESC, id DESC) | sessions(owner, updated_at DESC, id DESC). Use a trusted resolved owner set or indexed join; disable access immediately after claim/account changes. |
| Session/history restoration | Owner-authorized session ID, explicit binding and current eligibility for renderer actions; descending immutable attempt ordinal | Parent composite keys; unique(session, ordinal) supports backward history scan. Safe owner history excludes hidden scores without a renderer call. |
| Practice-set navigation | Exact owned set ID + item position/session | PK(set, position), owner-consistent composite FKs. Previous restores existing session; blocked/skipped remain distinct. |
| Draft/submission writes | Exact owned session, expected revision/baseline/generation and operation key | Unique branch, unique idempotency key and one-active-operation partial index; transaction protocol below. |
| Progress | Owned union, pinned server-PG provenance and correct source/environment, visible score policy; distinct exercise/source-version credit | Partial visible-credit index(owner, exercise, source version) WHERE server-PG/pinned/shown/score=1; owner/time index for history. A tiny table may rightly use sequential scan. |
| Verification/import scheduling | Scoped pending job state + lease/generation and ready time; source/profile/manifest identity | Add measured partial ready-job and FK indexes in 5.8. Worker lease/fencing and skip-locked scheduling do not make upstream requests exactly-once. |

The [six prepared queries](catalog-model/database-lab/queries.sql) demonstrate browsing, ranked search, topic filtering, recent owned sessions, safe history and current eligible-version progress. They parse and execute in the lab. The three recorded EXPLAIN ANALYZE plans separately cover keyset browsing, a selective approved-term query and pre-resolved-owner recent sessions. Other prepared variants/counts are correctness examples, not additional performance certifications.

Search uses `simple` text configuration for the initial multilingual-neutral token store, bounded Unicode-normalized case-insensitive terms and safe quoted tsquery prefixes. The lab enforces at most 160 query characters and twelve terms; empty queries use browse, not an unbounded search. Derived normalization never changes raw source identity. GIN is an appropriate inverted text-search index according to the [official PostgreSQL text-search documentation](https://www.postgresql.org/docs/16/textsearch-indexes.html).

PostgreSQL rank weights A/B/C/D use 0.5/0.4/0.3/0.1 for title/reviewed terms/topics/description. That preserves field priority but does not claim identical numeric ranking to the task 5.4 JavaScript preview; publish a distinct search-policy version and regression examples. No semantic-math equivalence or universal language stemming is implied.

A cursor carries scope/publication generation, metadata/taxonomy revision, locale, query/filter/search-policy identity and the exact boundary tuple. Protect/validate it server-side; never round ranking scores for cursor storage. Ranked search uses real rank plus UUID with descending-rank/ascending-ID predicates. A changed publication yields an explicit stale-cursor restart decision, not silently mixed pages. Public metadata cursors never grant session access.

## Atomic protocols and lock ordering

Use short database transactions; no renderer/network roundtrip while holding row locks. PostgreSQL row locks serialize competing updates, as described in the [locking reference](https://www.postgresql.org/docs/16/explicit-locking.html). Use one documented lock order: relevant account/anonymous principals in stable order → deployment head → session → submission operation/renderer state → draft. Pure catalog publication locks its head and does not acquire student locks in reverse order.

### Claim guest work

Validate account authentication, current guest proof, consent and origin/CSRF protection before locking. Lock the account/anonymous principals; resolve/reject existing claim; check queued/in-flight/uncertain operations for the guest scope. Insert the unique immutable claim plus event/proof record, revoke guest-only credential authority and advance ownership generation atomically. Same-account replay returns the existing claim; another target is unavailable. Do not use ON CONFLICT DO UPDATE to transfer ownership. Current cookie scope, auth changes and cache clearing follow [5.6](STUDENT_RECORDS_PRIVACY.md); the lab only tests structural uniqueness, binding protection and owner-query behavior.

### Draft compare-and-swap

Lock the owned session first. Compare its checked baseline, then update the matching owner/session/branch only where revision equals the expected revision. Return one affected row/new revision or a conflict; do not overwrite the losing work. The baseline and revision must be checked in the same transaction so grading cannot race between two independent reads.

The two-connection lab waits until writer B is actually blocked according to pg_blocking_pids, then releases writer A. A advances revision once; B's stale revision affects zero rows. Artificial file barriers/waits exist only in the test. This demonstrates one real database race, not a full browser/account/distributed-service concurrency certification.

### Grade and finalize

In a short first transaction, verify owner/current activation, lock session, resolve the idempotency key and canonical ordered-pair digest, acquire the active-operation fence and store the starting generation/publication context. Commit before contacting PG. Do not reuse a key with a different payload.

After PG returns, lock/revalidate the same owner/session/operation/generation and current policy. Advance private tokens/generation, accepted operation state, immutable attempt/ordinal and session latest-attempt pointer atomically. The lab FK requires an accepted operation before a new server-PG attempt can exist, and source/owner tuples must match. Validation of PG responses/field contracts remains backend code; JSON pair shape is not mathematical validation.

A timeout or crash can leave upstream execution uncertain. Retain that operation/fence and reconcile explicitly; neither a unique key nor a SQL transaction guarantees exactly-once external PG execution. If claim/withdrawal races an already produced grade, retain accepted/uncertain private state and token continuity under the specified policy rather than auto-resubmitting or erasing history. Full service orchestration/fencing/race tests remain integration work.

### Publish/withdraw a catalog release

Validate a complete exact manifest through the trusted assessor/publisher, then lock the deployment head and compare expected generation. Publish metadata/member references and head generation in one transaction, preserving prior releases/events. Reject a stale generation instead of last-writer-wins. Withdrawal moves current access state, not source/evidence/student records. Cache invalidation follows the committed generation; renderer actions recheck the live authority rather than trusting discovery-cache results.

Exactly-one-primary taxonomy changes use a transaction with a deferred group check, so replacing a primary can be atomic. Published taxonomy/metadata/evidence records require production immutable-release guards and separate draft editing; those wider guards are not all implemented by the lab subset.

## Privacy and permissions

The lab browser role can SELECT only a safe catalog projection; it cannot SELECT attempts/private renderer state or execute the account-owner resolver. This is a base-grant boundary test, not a Supabase JWT/RLS test. Synthetic account parameters are not authentication and lab superuser access must not be copied into the application.

Production should revoke browser access to private tables/functions, expose only intended catalog and owner-safe projections/RPCs, and enforce ownership before service-role queries. RLS cannot hide selected columns by itself. Protect account role assignment and new accepted PG writes; preserve old client-calculated attempts with their original provenance. Supabase base schema/reset files and deployed grants were not applied or queried here.

Nullable legacy source pins remain legacy-unbound; new server-PG proof requires pinned source and environment. Public progress only counts applicable owned, visible, accepted renderer records; a hidden private score never contributes to correctness. SQL history selects CASE visibility='shown' before returning score; actual canonical feedback/answer projection follows the existing backend contract and limits. Ordered JSON arrays preserve repeated answer names and whitespace; per-field allowlists, size limits and widgets still need the real renderer contract tests.

## Measured lab result and limits

The pinned PostgreSQL image runs **16.16**. The successful fixture contains **100,000 search documents and 20,004 sessions**. Constraint checks cover alias/source immutability, path case/traversal, taxonomy roots/ancestry/primary assignments, cross-list deduplication, assessment/release context, publication CAS/withdrawal, claim protection, parent ownership/version consistency, legacy NULL bypasses, operation fencing, answer arrays, suppression, permissions and parameterized queries. Fresh result: **59 checks pass**, all six prepared query contracts parse/execute, all three measured plans use their intended indexes, and actual row-lock blocking/CAS is verified.

The three natural planner paths use **search_documents_browse**, **search_documents_fts**, and **sessions_owner_recent** after ANALYZE, without disabling sequential scans or forcing an index. Saved plans include timings/buffers but are warm synthetic measurements, not latency SLOs, full-library workload proof, production hardware sizing or index coverage for every future query. The lab's playable-only materialization is not the separate full-library unavailable/indexed view.

The initial fixture exceeded a smaller temporary disk budget; the final runner uses a 1536 MiB data tmpfs, bounded WAL/shared buffers and a 2500 MiB container memory limit. These are disposable test settings, not production tuning recommendations or durability tests. No application/host volumes or network/ports are attached. The container is removed in finally, including on failed validation.

## Reproduce and hand off to 5.8

From the repository root with Docker's Linux engine running:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/catalog-model/verify-database-design.ps1
```

The image is digest-pinned in the script; Docker may download it on first use. The runner checks isolation, waits for the final PostgreSQL server (not its temporary init server), loads synthetic SQL, validates the coordinated race, records natural query plans and copies only sanitized observations. It does not require the existing workspace/renderer to run and never mounts their data.

Before task 5.8: confirm the target PostgreSQL/Supabase version, actual existing migration state and intended schema/role exposure; preserve root authored data and existing aliases. Convert the agreed design into additive ordered migrations, implement the remaining groups/permission/immutable-publication guards, and test fresh install plus upgrades/backfills on disposable databases. Validate actual RLS/RPC and concurrent service protocols before connecting accounts/importer/UI. Do not run database-lab/schema.sql or the destructive root supabase/schema.sql as an upgrade.
