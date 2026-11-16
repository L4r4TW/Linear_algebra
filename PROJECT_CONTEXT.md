# Project context and session handoff

Updated 2026-11-16. Start with this handoff, [AGENTS.md](AGENTS.md), and the detailed [experimental workspace README](experimental-workspace/README.md). Product direction is in [Project_goals.md](Project_goals.md).

## Where development stands

The active work is the independent **experimental-workspace/** WeBWorK integration. The existing root Next.js/Supabase application remains separate. Its earlier context is retained below; do not confuse its grading, tests, or authentication with the sandbox.

The goal has expanded to a multi-subject practice platform covering the whole OPL, using PG mathematical grading. Design the future catalog for all subjects, while validating playable exercises in batches. Build one complete, reliable exercise flow before broadly enabling large numbers of exercises.

Latest practice-runtime implementation: `3eefcbb` (continuity acceptance), pushed to `origin/main` on 2026-11-15. The subsequent database/importer milestones below preserve that runtime; their tests are separate. Run `git log -1` and `git status --short` before continuing, and preserve newer local work.


## Current milestone: repeatable OPL importer (6.1–6.7)

All seven importer subtasks are implemented. Separate commits/pushes completed 6.1 through 6.6 (`c95e7f7`, `e6048d1`, `f7a2302`, `3de215c`, `32698f5`, `988b81f`); inspect Git for the final 6.7 commit. The [importer guide](experimental-workspace/opl-importer/README.md) contains exact setup, recovery, search and test commands. Its independent local PostgreSQL catalog uses a separate persistent volume/internal network with no published ports, reading OPL read-only. No existing application/session volume or hosted Supabase was changed.

The [full import report](experimental-workspace/opl-importer/full-import-observations.json) records **77,134 indexed regular PG sources** at revision 0d42812d6d02960c846fc0f89215e0d4f1e761b1: 40,541 OpenProblemLibrary, 29,624 Contrib, 6,969 Pending. All eleven bootstrap aliases/UUIDs are preserved; 77,123 new identities were allocated. No PG executes and no approval/activation is created. Source/generated metadata has explicit provenance and unknown fields; 38,740 classifications match source taxonomy and 38,394 remain missing/partial/conflicting/malformed/unmapped. Eighteen sources have invalid UTF-8 metadata. Diagnostics and operator actions remain available without silently guessing labels.

Fresh verification: **9 importer test groups, 13 full-library assertions, 134 fresh/legacy-upgrade database checks** pass. An actual Docker kill after 1,000 committed staging rows with no published head was followed by successful same-run recovery. Completed reruns preserve the exact identity digest and source/version/event/classification counts. Natural browse and GIN plans are recorded. Migrations through 202611160010 cover 60 catalog/private tables. Synthetic tests use a separate disposable database; full inventories/database data remain in Docker, with only sanitized observations checked in. Earlier renderer/browser counts remain historical.

The full catalog is searchable via server-only adapter/CLI and safe database RPCs, with filters, counts and generation-bound cursors. It is **not wired to the existing frontend or hosted Supabase**. The new database currently has zero practice-ready entries; the unchanged practice UI still enables six verified JSON entries. Next is the HTTP discovery adapter and planned home/search/Subject → Chapter → Section UI, then reviewed mappings/identity decisions and verification batches. Account/practice persistence remains separate. Do not infer approval from an import, source hash or metadata match.

## Resume checklist

1. Inspect `git log -1` and `git status --short`, then read [CATALOG_COMPATIBILITY.md](experimental-workspace/CATALOG_COMPATIBILITY.md) and [CATALOG_STATUS.md](experimental-workspace/compatibility/CATALOG_STATUS.md).
2. Start Docker Desktop's Linux engine. From `experimental-workspace/`, run `docker compose up --build -d --wait --wait-timeout 240`. Open http://localhost:3100; six exercises should be available.
3. Run `docker compose exec -T workspace npm test` and `docker compose exec -T workspace node server/check-catalog.mjs` for the ordinary catalog checks. Fresh continuity validation is 173 server tests, 62 browser checks, the live catalog check, six exercise continuity cases and two real-outage viewport cases. The 14 publisher/report checks and 42/44 full gate are prior evidence for the unchanged runtime.
4. Full `verify-compatibility.ps1` remains a deliberately failing gate: 42/44 cases pass; both mobile GraphTool cases fail. Keep those failures and the five disabled candidates visible. Do not treat a nonzero full gate as permission to weaken required checks.
5. Finish runtime/profile edits before regenerating evidence. Fingerprints include source bytes and line endings, so a checkout that changes those bytes requires reverification. Use the documented publisher to produce reviewed metadata/evidence; do not manually rewrite evidence fingerprints to restore eligibility.

The whole OPL remains in its Docker Linux volume. Task 6 now indexes the pinned library in a separate local catalog database; hosted Supabase and the existing practice frontend remain unchanged. Continue with HTTP discovery/UI integration and verification batches; preserve existing sessions and attribution.

## Completed milestone: failure and navigation continuity acceptance

Continuity subtask 8 is verified. [CONTINUITY_VERIFICATION.md](experimental-workspace/CONTINUITY_VERIFICATION.md) maps refresh, accepted-but-lost responses, blocked draft saving, back/forward, pending navigation, ownership, keyboard semantics and mobile checks to repeatable evidence. Two new actual same-owner tab tests verify independent drafts and the existing newer-checked-result precedence with a visible warning. No automatic live merge or older-conflicting-draft recovery is provided.

The new verify-continuity.ps1 runs the server/catalog/browser suite and real desktop/mobile outage audit. It SIGKILLs only the experimental renderer after sessions are prepared, tests offline grading/refresh/retry and privacy, restarts the same container normally, then proves exact draft/question restoration and explicit-only regrading. Fresh results: 173 server tests, 62 browser checks, all six focused continuity cases and both outage viewports pass; normal restart succeeded with no fallback. Sanitized evidence is linked from the acceptance document. No application runtime or catalog activation changed; the matching full seeded evidence remains historical 42/44, with both mobile GraphTool failures disabled.

Next release checks: actual NVDA/VoiceOver listening and physical mobile devices. Before account/public scale, decide draft conflict recovery, cross-device persistence, durable attempt history, request idempotency and distributed locking. Keep the future whole-library importer behind capability verification; this milestone enables no additional exercises. Run git status/log to confirm commit and push state.

## Current milestone: additive migrations and validation (5.8)

Task 5.7 was committed/pushed as `df5c369`. Task 5.8 is implemented in [DATABASE_MIGRATIONS.md](experimental-workspace/DATABASE_MIGRATIONS.md), with [five ordered additive migrations](supabase/migrations/README.md). They create the catalog/provenance/taxonomy/metadata/evidence groups and private ownership/practice records, forced RLS and narrowly projected catalog/owner RPCs, immutable published evidence/release boundaries, computed eligibility, publication CAS and backend-only claim/draft/submission transaction functions. Existing public authored data remains separate; browser role self-promotion is blocked by an additive profile trigger.

Fresh [migration observations](experimental-workspace/migration-tests/migration-observations.json): **134 PostgreSQL checks pass** (63 fresh / 71 legacy upgrade), including six legacy-table fingerprints, cross-account access, direct private-data/function denial, suppressed-feedback redaction, incomplete/failed evidence rejection, atomic accepted-result/token persistence and rollback, explicit claims, bootstrap replay and actual two-connection draft-lock/CAS races in both databases. There are 57 new tables and eleven retained aliases. The inspected digest-pinned PostgreSQL 16.16 container has no network, ports, host/application volumes and is removed in finally. Only synthetic Auth/users/answers are used; this is SQL role/RLS evidence, not hosted Supabase or HTTP JWT verification.

Reproduce from the root with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/migration-tests/verify-migrations.ps1`. Exact migration/test hashes are recorded. The eleven-entry bootstrap publishes metadata only, with no database activation or fabricated compatibility/account/session history. Neither app has a new database adapter; the experimental UI still uses its six enabled JSON entries and existing anonymous session persistence. No hosted project, live student work, OPL/session volume, renderer or running app was changed. Earlier renderer/browser counts remain historical. Inspect Git status/log for commit/push state.

Next: a restartable full-library metadata importer and server database adapter, followed by paginated topic/search discovery and the planned home/subject-chapter-section UI. Keep unknown classifications/metadata explicit and imported entries disabled until exact capability evidence and publication exist. Before applying these migrations to a hosted project, inspect its version/history/roles/API exposure and rehearse on staging; never use the destructive base schema or 5.7 lab SQL as an upgrade. Account/guest proof verification, HTTP/RPC integration, encryption/retention and end-to-end service orchestration remain integration work.

## Completed model: database constraints and query patterns (5.7)

Task 5.6 was committed/pushed as `a62617a`. Task 5.7 is defined in [DATABASE_DESIGN.md](experimental-workspace/DATABASE_DESIGN.md), with concrete keys/FKs/checks, indexes, pagination/search/ownership queries, lock/CAS/idempotency protocols and a clear boundary between prototype coverage and remaining production DDL. The guarded database-lab SQL is an isolated prototype, not a Supabase migration or a complete production schema.

Fresh [database observations](experimental-workspace/catalog-model/database-design-observations.json): **59 PostgreSQL checks**, six parsed/executed parameterized query shapes, three natural EXPLAIN ANALYZE index plans, and an actual blocked two-connection draft CAS race pass. The digest-pinned PostgreSQL 16.16 container used 100000 synthetic search documents and 20004 synthetic sessions, no network/ports/host or application volumes, and was removed in finally. [Query plans](experimental-workspace/catalog-model/database-query-plans.json) are warm synthetic evidence, not production SLOs. No hosted database, private student record, OPL/session volume, running app, account or activation was changed.

Reproduce from the root with catalog-model/verify-database-design.ps1; the existing workspace/renderer need not run. The lab requires Docker and its pinned PostgreSQL image, uses temporary memory-backed data/WAL settings and records SQL hashes/configuration. Do not run model_lab/schema SQL in Supabase or replace legacy public tables. Existing renderer/browser compatibility counts remain historical; inspect Git status/log for this task's commit/push state.

The additive migration follow-up (5.8) is now implemented and validated locally; see the current milestone above. Hosted deployment and operational importer/account/discovery integration remain separate.

## Completed model: student-record relationships and privacy (5.6)

Task 5.5 was committed/pushed as `a4fdeaa`. Task 5.6 is defined in [STUDENT_RECORDS_PRIVACY.md](experimental-workspace/STUDENT_RECORDS_PRIVACY.md): student principals and explicit unique guest/account claim links; owned practice sets/items, pinned sessions, private renderer state, submission operations, append-only attempts, draft branches, bookmarks and progress. It includes a relationship diagram and public/owner/backend/operator access matrix. Claims preserve IDs/history and retire old guest-only authority; catalog roles do not grant private student access.

The [synthetic fixture](experimental-workspace/catalog-model/student-record-examples.json) and [reference policy](experimental-workspace/catalog-model/student-record-policy.mjs) are design tools, not authentication, RLS or production authorization. Fresh [observations](experimental-workspace/catalog-model/student-record-observations.json): 22 checks pass for owner/foreign/guest/role access, parent consistency, consent/proof/replayed/blocked claims, retired-cookie and disabled-account behavior, stale draft revisions/baselines, ordered answer pairs, private-field redaction, uncertain/unknown visibility, suppression-aware progress, legacy provenance and retake deduplication. No real student records, Supabase/PG calls, claims, SQL or runtime changes occurred; only checked-in code-reference hashes and synthetic outcomes are recorded.

Reproduce with catalog-model/verify-student-record-model.ps1 from the repo root. New claim/API routes, account login integration, server draft sync, distributed idempotency/transactions and deployed RLS remain unimplemented. Current anonymous ownership/tab drafts and six enabled exercises stay unchanged; earlier app/browser/compatibility counts remain historical. Inspect Git status/log for this model's commit/push state.

The constraint/query follow-up (5.7) is now defined in DATABASE_DESIGN.md, including parent-consistent FKs, unique claim/idempotency keys, CAS/publication generations, owner-scoped query/index design and retained-history/deletion rules. Task 5.8 implements additive migrations and database validation before importer/account/discovery integration.

## Completed model: compatibility evidence and activation (5.5)

Task 5.4 was committed/pushed as `9665c50`. Task 5.5 is defined in [COMPATIBILITY_DATA_MODEL.md](experimental-workspace/COMPATIBILITY_DATA_MODEL.md): source-version requirements, immutable profile/environment identity, declared run targets, retained attempts, reviewed evidence bundles, computed assessments and version-pinned activation/withdrawal records. Compatibility, metadata publication, technical availability and deployment/rights policy stay separate. No current gate rule was changed.

The [read-only normalizer](experimental-workspace/catalog-model/compatibility-model.mjs) and [model examples](experimental-workspace/catalog-model/compatibility-model-examples.json) preserve all eleven live gate decisions and 44 historical cases: 7 verified / 2 limited / 2 unsupported, 6 enabled, with both mobile GraphTool failures retained. Current requirements are separate from the tested source/capability bindings, so a stale source cannot overwrite what the evidence actually tested. Missing source-version UUIDs, PG/dependency/worker identities, retry history and approval actors remain null/not-recorded.

Fresh [model observations](experimental-workspace/catalog-model/compatibility-model-observations.json): 15 contract checks pass, including cloned-memory withdrawal, stale source/runtime, incomplete/duplicate coverage, missing proof, failed ownership and retained retry failures. Reproduce with catalog-model/verify-compatibility-model.ps1 from the repo root. There were no new PG requests, session reads, service restarts, SQL, activation or application-runtime changes. The 42/44 gate and 173-server/62-browser results remain historical evidence, not reruns. Inspect Git status/log for this design's commit/push state.

The student-record/privacy follow-up (5.6) is now defined in STUDENT_RECORDS_PRIVACY.md; next are constraints/queries (5.7) and additive migrations (5.8), before operational importer/discovery integration. Dynamic publication concurrency, worker authentication, public deployment policy and in-flight withdrawal/grading behavior are specified as later implementation requirements, not already deployed features.

## Completed model: student-facing catalog metadata (5.4)

Task 5.4 is complete in [CATALOG_METADATA.md](experimental-workspace/CATALOG_METADATA.md). It specifies title/description selection, source/curated provenance, reviewed search terms, actual display locale versus unknown exercise language, nullable difficulty/time, source credits and independent rights evidence. Eleven design examples and an executable reference projection/search live in catalog-model/, outside the live runtime. All eleven keep language/difficulty/time unknown; no source Level mapping or textbook-author substitution is invented.

Open the generated [local metadata card preview](experimental-workspace/catalog-model/catalog-metadata-preview.html) in a browser to inspect search, six locally playable examples, the optional eleven-entry unavailable view and credit/unknown-value details. This is a standalone preview, not an updated student app or session picker; it cannot start/check exercises. Its availability is a timestamped live-gate snapshot. The live practice UI remains localhost:3100 with the same six entries.

Fresh validation: eleven source hashes/metadata inventories, thirteen projection/search scenarios, and Chromium checks of the generated preview pass (search, filter, keyboard disclosures, CSP, no load-time network and 360 px fit). Reproduce with catalog-model/verify-metadata-contract.ps1 -CheckPreview from the root; the optional preview check uses the existing linear-algebra-picker-qa image. Sanitized observations, DTOs and preview are retained. No SQL, accounts, private session access, PG execution, activation or application runtime changes; historical full app/compatibility counts are not reruns. Metadata artifacts were committed/pushed in `9665c50`; inspect Git status/log for subsequent model work.

The compatibility/evidence and activation follow-up (5.5) is now specified in COMPATIBILITY_DATA_MODEL.md, building on the existing fail-closed gate. Then private student relationships (5.6), queries/constraints (5.7), additive migrations (5.8), importer and connected discovery UI make the full-library catalog operational.

## Completed design: topic hierarchy and source mappings (5.3)

Task 5.3's design was committed/pushed as `1818f7c` and is defined in [TOPIC_TAXONOMY.md](experimental-workspace/TOPIC_TAXONOMY.md): immutable raw classifications, a versioned curated Subject → Chapter → Section tree, many-to-many exercise assignments, reviewed mapping rules, primary/context breadcrumbs, unclassified handling and distinct playable counts. The [design fixture](experimental-workspace/catalog-model/taxonomy-examples.json) has 30 nodes across six subjects and mappings for all eleven catalog IDs. It is an example subset, not a restriction on full-library subject coverage; UUIDs remain null and assignments unpublished.

Fresh [design/source observations](experimental-workspace/catalog-model/taxonomy-design-observations.json) pass all 30 nodes, eleven source-hashed catalog examples, one pinned source-only differential-equations example and nine classification scenarios. The live eligibility gate supplies the playable IDs; cross-listing dot product yields seven subject memberships but six distinct playable exercises. Source vocabularies and raw declarations are preserved separately from curated labels. No PG execution, session access, SQL, UI/runtime change or catalog activation occurs; this does not rerun compatibility/browser acceptance. Run catalog-model/verify-taxonomy-examples.ps1 from the repo root to reproduce. Taxonomy design artifacts were committed/pushed as `1818f7c`; inspect Git status/log for subsequent metadata work.

The metadata follow-up (5.4) now specifies titles/descriptions, search terms, language, attribution/license provenance and unknown difficulty/time estimates in CATALOG_METADATA.md. Account/private relationships, queries/constraints and additive migrations remain later subtasks.

## Completed design: exercise identity and source versions (5.2)

Task 5.1's audit is committed/pushed as `d042eed`. Task 5.2's design was committed/pushed as `68fb4fb` and is defined in [EXERCISE_IDENTITY.md](experimental-workspace/EXERCISE_IDENTITY.md): opaque persisted exercise UUIDs, permanent legacy aliases, immutable snapshot/path/hash versions, distinct copies, reviewed renames/reappearances, scoped absence detection and retained withdrawal/history. The [bootstrap plan](experimental-workspace/catalog-model/identity-bootstrap-plan.json) covers all eleven current IDs without allocating UUIDs or changing the runtime catalog. Exact source versions and rendering environments are required for future integrated sessions; old records remain legacy-unbound rather than inheriting today's source by inference.

Validation: [verify-identity-plan.ps1](experimental-workspace/catalog-model/verify-identity-plan.ps1) passes complete alias coverage/uniqueness and all eleven installed source-byte hashes at the pinned OPL HEAD. The update/rename/concurrency examples are design acceptance requirements, not a claimed implemented importer. No SQL, account/session migration, runtime code, activation or compatibility evidence changed; earlier app-test counts remain historical. Inspect Git status/log for the current design commit/push state.

The taxonomy follow-up (5.3) now defines raw classifications separately from curated Subject → Chapter → Section nodes and multi-topic assignments in TOPIC_TAXONOMY.md. Then continue metadata (5.4), evidence/activation (5.5), private student relationships (5.6), constraints/queries (5.7) and additive migrations (5.8).

## Completed audit: existing models and OPL metadata (5.1)

Task 5.1 is complete in [CATALOG_MODEL_AUDIT.md](experimental-workspace/CATALOG_MODEL_AUDIT.md): current catalog/evidence, actual session-record shapes, checked-in Supabase schema/policies and installed OPL metadata are mapped to proposed platform entities. The [read-only survey](experimental-workspace/catalog-audit/survey-opl.mjs) and [observations](experimental-workspace/catalog-audit/opl-metadata-observations.json) distinguish 40,541 OpenProblemLibrary PG files from 77,134 across all three source areas. Counts are file occurrences at the pinned checkout, not unique runnable exercises or approval for activation.

Reuse source identities, attribution, eligibility rules, ordered answers and atomic session/submission semantics. Preserve legacy Supabase course content and client-graded attempts separately. The audit records incomplete metadata, source/curated topic differences, absent immutable session source references, missing attempt history and checked-in RLS/grading-authority gaps. No live Supabase state was queried and no schema, runtime, session or catalog activation was changed. Existing test results remain prior evidence; this audit does not rerun or renew compatibility approval. Audit artifacts/docs were committed and pushed in `d042eed`; inspect Git status/history for subsequent design work.

The identity/source-version decisions from task 5.2 are now specified in EXERCISE_IDENTITY.md; they do not implement the importer or database. Then proceed through taxonomy (5.3), display metadata (5.4), compatibility/activation (5.5), private student relationships (5.6), constraints/queries (5.7) and additive migrations/validation (5.8). Do not start a whole-library import or account migration as an implicit extension of this audit.

## Next work and decisions

The eight feedback/continuity subtasks are complete for the verified local scope. Manual accessibility/device acceptance and production architecture are still outstanding. Do not reopen completed hints or navigation work just because an older milestone below calls it next.

1. Perform and record actual NVDA/VoiceOver listening and physical mobile checks: spoken mathematics, reading order, announcement timing, keyboard focus, leaving with drafts and failure recovery. Automated semantics do not establish spoken output.
2. Define account ownership and persistence before public/account integration: anonymous-cookie migration, server-side drafts, conflicting-tab draft recovery, durable attempt history, idempotency and concurrency beyond one Node process.
3. Design the multi-subject catalog/importer around the existing capability contract: stable IDs, attribution/license metadata, source revisions, topic/search metadata, disabled-by-default ingestion and resumable verification batches. OPL source already exists in the Linux volume; importing metadata is separate from enabling playable exercises.
4. Keep unsupported capabilities visible. Fix and reverify mobile GraphTool, scaffold lifecycle and remaining unapproved interactions/layouts before activating affected batches. The economics candidate's verified evidence alone does not add it to the active batch.
5. Integrate the experimental flow into the main application only as an explicit implementation task; prepare renderer/service hardening and deployment separately from local catalog growth.

## Verification commands for the next session

Run from the repository root unless the command explicitly changes directory. Avoid overlapping renderer-dependent tests with outage runs.

| Purpose | Command | Scope |
| --- | --- | --- |
| Current failure/navigation acceptance | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-continuity.ps1` | 173 server tests, 62 browser checks, live catalog and real desktop/mobile renderer interruption/recovery; requires matching runtime evidence |
| Focused real outage | Same command with `-OutageOnly` | Two viewport cases only; briefly interrupts the experimental renderer and restores it |
| Full seeded compatibility | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-compatibility.ps1` | Full operator gate; currently 42/44 with two explicit mobile GraphTool failures |
| Renderer/client/session API smoke coverage | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-practice.ps1` | Existing broader smoke runner; optional `-IncludeRendererOutage` adds its API-level outage check |

The six-entry focused continuity audit is separate from verify-continuity.ps1; reproduce it using [CONTINUITY_FEEDBACK_AUDIT.md](experimental-workspace/CONTINUITY_FEEDBACK_AUDIT.md). Read [CONTINUITY_VERIFICATION.md](experimental-workspace/CONTINUITY_VERIFICATION.md) for evidence and limits. The last 14 publisher/report checks and full 44-case run belong to the preceding runtime milestone; they were not rerun during the tests/docs-only acceptance change. Documentation-only edits require link/command validation and `git diff --check`, not another renderer interruption.

## Historical implementation milestones

The sections below preserve results and next-step notes as they stood at each milestone. Current scope and next work are defined above.

## Previous milestone: retry and protected move-on controls

Continuity subtask 7 is implemented. [PRACTICE_ACTIONS.md](experimental-workspace/PRACTICE_ACTIONS.md) defines next actions, fresh answer collection before leaving, native confirmations, history and unload protection. Every result offers Return to answers and Choose another exercise with same-session retry guidance. Choosing another only focuses the catalog; selecting a card is the separate leave. The current exercise's card explicitly labels a new variation as starting a new session.

Unchecked, pending and unreadable work is protected before session replacement. Cancel retains the exact live frame, answers and URL; confirmed navigation preserves the old session-bound tab draft where storage works. Storage/collection failures warn instead of silently leaving. App history cancellation restores the committed entry without a new session or duplicate history. Browser reload/exit uses the standard best-effort beforeunload prompt. No automatic grade or fresh variation is created by the retry/result controls. Existing ownership, pending-grade reconciliation, hint disclosure and PG isolation remain intact. See the document for browser/tab-storage limits.

QA explicitly consents to intentional reloads/leaves in existing operator flows; dedicated browser tests verify cancellation. Runtime evidence has been renewed through the publisher for the same six enabled entries. This handoff is included with the practice-action changes on main. Next: end-to-end continuity acceptance and the remaining deliberate multi-tab/account/history decisions before a full-library importer.

Validation for practice actions: 173 server tests, 60 browser checks and 14 publisher/report tests pass, plus 12 real-PG hint cases plus 12 catalog seed probes and 22 real-PG feedback cases (all with next actions verified), plus two stale/revert checks. The normal rebuilt workspace passes its live six-entry catalog/API checks and focused result/new-session/rapid-history browser checks. Full compatibility is 42/44: both mobile GraphTool cases reach completion with touch-positive grading failures and stay disabled. No check, timeout, grading/ownership predicate or activation rule was weakened. The normal workspace on port 3100 has the local implementation; this handoff accompanies the practice-action commit after `05e30f4`.

## Previous milestone: available authored hints

Continuity subtask 6 is implemented. [AUTHORED_HINTS.md](experimental-workspace/AUTHORED_HINTS.md) documents the pinned renderer/PG source behavior, supported hint markup, actual availability rules and safe local disclosure. `hintExists` alone is insufficient: the app requires an explicit renderer flag plus a nonempty supported standard hint body. Withheld, absent, empty, unstructured and unsupported hints produce no action. Marked hint/solution blocks are removed from the live question; only canonical authored hint text is exposed separately, with the existing reviewed notation rules. Solutions and instructor/correct-answer data remain private.

View hint is a local accessible disclosure. It does not call the renderer/session/grading APIs, collect or submit current answers, mutate tokens/counts, or replace the exercise frame. The same session and drafts survive. Grading refreshes availability; changed/withdrawn content closes, and refresh recomputes availability with the disclosure closed. No synthetic attempt threshold or hint explanation is invented. Standard PG HINT has no attempt-count threshold; source-authored conditions must actually return eligible content.

The operator-only [hint audit](experimental-workspace/compatibility/hint-audit.mjs) requires 12 real-PG cases at seeds 1234/4321 and desktop/touch-mobile: a PCC/Alex Jordan hint with a separate withheld solution, the same source under actual signed `showHints=0` policy, and a no-hint dot-product control. It checks exact authored content, no solution disclosure, read-only view/hide, repeated-name checkbox drafts, grading/refresh/ownership, keyboard and mobile. It additionally probes all six enabled entries at both seeds. No new student exercise is activated. Unsupported graphical/interactive/unwrapped hint formats remain unapproved. Next work: deliberate move-on controls with unfinished-work protection.

Validation for hint support: 170 server tests, 54 browser checks and 14 publisher/report tests pass, plus 12 real-PG hint cases, 12 enabled-catalog seed probes and 22 real-PG feedback cases with two stale/revert checks. The rebuilt normal workspace passed the live six-entry catalog check and required renderer/session/API/grading/submission-state smoke checks. Full compatibility was renewed via the publisher: 42/44 pass; both mobile GraphTool cases reach completion with touch-positive grading failures and remain disabled. All six enabled entries have matching fresh runtime evidence; no new exercise was activated. See AUTHORED_HINTS.md and the current sanitized reports for exact scope. This handoff accompanies the hint-support commit after `cf072fe`; inspect Git status/history for newer work.

## Previous milestone: safe and readable PG feedback

Continuity subtask 5 is implemented. [FEEDBACK_PRESENTATION.md](experimental-workspace/FEEDBACK_PRESENTATION.md) specifies the canonical student-message projection, reviewed TeX vocabulary and resource budgets, optional formatting fallback, privacy boundary and accessibility rules. Paragraphs/line breaks now survive. Explicit reviewed TeX typesets in field feedback and the overall result through the pinned MathJax library; arbitrary PG feedback HTML remains inert text. Unknown notation remains literal. HTML superscripts/subscripts retain readable text notation. No mathematical explanation is generated from expected answers.

Overall feedback exposes only message/summary strings. Correct-answer claims, hidden answer/solution markup and tokens remain private; authored suppression continues to remove all public feedback and scores. Field feedback stays in the opaque frame; the shell lazily loads only the fixed math library for reviewed overall notation, with automatic typesetting disabled. Async formatting cannot overwrite changed/replaced messages. Original notation remains on optional formatting failure, without disabling grading or changing scores. Existing plain-string snapshots remain compatible.

The real-PG audit now requires 22 passing cases at seeds 1234/4321 plus two stale/revert checks, including two actual authored equation forms after grading and refresh from a source-pinned RA Cruz/College of Idaho fixture. That fixture remains operator-only. Browser tests additionally cover synthetic hostile HTML/TeX, overall notation, formatting failure and long-expression keyboard scrolling. Final validation passed 161 server tests, 52 browser checks and 14 publisher/report tests, all 22 real-PG cases plus two stale/revert checks, and live catalog/renderer/session/API/grading/submission-state checks. Full compatibility evidence was regenerated and published for this runtime: 42/44 cases pass. Both remaining failures concern mobile GraphTool; seed 1234 reaches completion with a touch-grading failure and seed 4321 fails the partial-credit interaction at graph-stale-feedback. GraphTool stays disabled, and the same six entries remain approved. The economics dropdown now passes the four current seed/viewport cases, but remains disabled because it is outside the active batch; its earlier narrow-layout observation is historical. An earlier concurrent run timed out during dot-product refresh; the isolated full rerun passed every enabled case without changing checks/timeouts. Next work is available authored hints and deliberate move-on controls; hints and solutions are not added here. This handoff accompanies the presentation commit after `4ab8d08`; inspect Git status/history for subsequent work.

## Previous milestone: consistent PG feedback outcomes

Continuity subtask 4 is implemented. [FEEDBACK_MODEL.md](experimental-workspace/FEEDBACK_MODEL.md) documents field states, overall precedence, actual PG scores, suppressed visibility and stale/revert rules. [feedback-observations.json](experimental-workspace/compatibility/feedback-observations.json) records 20 passing owned-session real-PG browser cases at seeds 1234/4321 plus two stale/revert checks. [feedback-fixtures.json](experimental-workspace/compatibility/feedback-fixtures.json) keeps source hashes, attribution and license evidence separate from student activation.

The model distinguishes unanswered, invalid, incorrect, per-field/overall partial, correct and ungraded states. It retains PG's authoritative aggregate instead of averaging fields, prioritizes visible parser failures, and avoids rounding partial scores into 0%/100%. Feedback is bound by generated name; only changed fields become stale, old invalid semantics clear on edit, and exact revert restores saved feedback without grading.

Real authored suppression still leaves scores in raw renderer JSON. The app now persists `feedbackVisibility: suppressed`, keeps the private PG score, and redacts both public score locations, all grading messages and individual claims. Public scores are null, fields are ungraded with reason suppressed, and the UI says Answers submitted / Feedback withheld. Legacy restoration adopts actual PG suppression without rewriting history. No student endpoint accepts flags/instructor settings. The extra probability suppression fixture and desktop GraphTool partial-credit fixture remain operator-only, not enabled catalog entries.

Feedback validation: 153 server tests, 49 browser checks, 14 publisher/report tests and all 20 real-PG feedback cases plus two stale/revert checks pass. Full compatibility was regenerated for the changed runtime; the two known mobile GraphTool failures remain blocked. The real-PG audit is included in verify-compatibility.ps1. The normal catalog stays at six approved entries; all five limited/unsupported candidates remain disabled. Runtime evidence is renewed through the documented publisher, not by editing fingerprints. Next work: richer reviewed PG message/mathematics presentation, available authored hints, and deliberate result-area move-on controls. This handoff accompanies the feedback-model commit after `76fbda5`; inspect Git status/history for subsequent work.

## Previous milestone: explicit saved-session recovery

Continuity subtask 3 is implemented locally. Read [SESSION_RECOVERY.md](experimental-workspace/SESSION_RECOVERY.md) for the API/status/action table and actual pinned-renderer token behavior. Transient failures offer explicit same-session loading retries. Confirmed expired/rejected tokens and withdrawn exercises preserve the saved record/draft and offer the catalog. Missing and unowned sessions deliberately share identical public 404 responses; ownership is distinguished internally without exposing another browser's session existence.

Browser errors now retain safe API codes. Terminal grading errors leave the live frame editable but block another check. Lost/unconfirmed grading responses require Reload saved session (GET only) before checking again. That recovery keeps the current frame while loading is pending or failing, then carries the latest bounded in-memory draft after a successful same-session/owner response, including when tab storage is blocked. No automatic regrading, token replacement, session deletion, seed regeneration or GET-to-new-session fallback is added. Initial-start retry explains that it creates a new session when no session ID was received.

The renderer reports token failures as HTTP 500; a real local probe confirmed distinct expired, bad-signature and malformed-token messages. Only reviewed structured error patterns are classified. Default session-token generation does not set an explicit expiry claim; this change does not add a time limit. Signing keys and test tokens stay inside the renderer container; [token-error-observations.json](experimental-workspace/compatibility/token-error-observations.json) records sanitized booleans/statuses only.

Recovery validation: 136 server tests, 47 browser checks and 14 publisher/report tests pass, plus the live six-entry API check and current continuity audit. Full seeded compatibility was renewed: 42/44 cases pass; both mobile GraphTool positive-grading failures remain blocked. The same six active exercises have current matching runtime evidence. The focused real renderer outage/restart check passed: 503 for owned renderer-dependent requests while offline, 404 for unauthorized access, and exact question/submission restoration after normal restart. The renderer is healthy; no volumes were removed.

Next: refine grading outcomes and feedback/suppression presentation, then add only authored/available hints and deliberate move-on controls. General grading idempotency, account/cookie recovery, attempt history and cross-device draft sync remain future work. Runtime changes require renewed full compatibility evidence; preserve all unsupported-capability failures. This handoff accompanies the explicit-session-recovery commit after `236fdae`; inspect Git history and working-tree status for subsequent changes.

## Previous milestone: unfinished answer drafts

Continuity subtask 2 is implemented locally. Read [DRAFT_PERSISTENCE.md](experimental-workspace/DRAFT_PERSISTENCE.md) for the per-tab storage contract and precedence rules. All six enabled native exercises preserve unfinished edits across refresh, including whitespace/vector strings, radio selections, repeated-name checkbox pairs and clearing. Drafts are isolated by original session/exercise and only applied after a successful owned-session response with matching fields.

The server still stores graded submissions; browser `sessionStorage` stores unfinished drafts for the current tab's page session. Closing the tab or clearing browser data can remove drafts. Restored drafts take precedence over their checked baseline and mark prior feedback stale. Successful grading clears only the submitted version; newer edits remain a draft. A pending snapshot reconciles accepted-but-lost responses on refresh. An unrelated newer checked result wins over an older local draft. Storage/restore errors are visible without disabling editing or grading. Cross-device autosave and automatic multi-tab synchronization are not implemented.

The original [audit evidence](experimental-workspace/compatibility/continuity-audit-before-drafts.json) remains historical. The revised [continuity audit](experimental-workspace/compatibility/continuity-audit.json) now requires drafts to survive refresh before/after checks and a failed load. Runtime and compatibility evidence are regenerated together; do not manually change fingerprints or delete saved sessions. This handoff accompanies the draft-persistence commit after `d383a3f`; inspect Git history and working-tree status for subsequent changes.

Validation for draft implementation: 108 server tests, 37 browser checks and 14 publisher/report tests pass, plus the live six-entry API gate and revised six-exercise continuity audit. Full seeded compatibility was rerun: 42/44 pass; both mobile GraphTool positive-grading cases fail and remain disabled. All six active entries have renewed evidence for the new runtime fingerprint. No real renderer-outage or manual screen-reader review was rerun.

Next task: recovery-specific next actions for permanent/unavailable/expired sessions and uncertain submissions, preserving ownership privacy. The pending-draft reconciliation here does not provide general grading-request idempotency. Continue to keep GraphTool/scaffold/layout candidates disabled under their existing compatibility limits.

## Historical baseline: feedback and continuity audit

The next product milestone is reliable feedback and continuity. Subtask 1 is complete locally: [CONTINUITY_FEEDBACK_AUDIT.md](experimental-workspace/CONTINUITY_FEEDBACK_AUDIT.md) separates working behavior from missing features, with a per-entry table and sanitized [fresh observations](experimental-workspace/compatibility/continuity-audit.json).

Fresh checks covered all six enabled exercises in the default application: same exercise on refresh, checked blank-answer/feedback restoration, changed-answer labels, input preservation after an injected failed check, and load retry without starting another session. All five text-answer exercises also distinguished real PG parser errors from valid-but-wrong answers and restored both result types. The radio fixture's incorrect/correct evidence remains the existing seeded run. Unsubmitted edits before or after checking are lost on refresh in all six, including native choices.

Fresh validation: 100 server tests and the six-entry live API check passed. The earlier 24 seeded cases for these six entries and 29 browser-suite checks were reviewed, not rerun. No runtime, compatibility approval, original-app code or existing session records were changed; the audit creates its own normal sessions and records no private answer/session values. This handoff accompanies the audit commit after `0e2534e`; inspect Git history and working-tree status for subsequent changes.

At the time of that audit, the next task was draft saving. Subtask 2 is now implemented below; remaining work is recovery-specific next actions, feedback/suppression rules, available authored hints, and protected move-on controls. Read the audit's missing-feature checklist and reproduction commands first. Preserve the known GraphTool/scaffold/layout blockers and the full gate's existing failures.

## Capability-based exercise enablement (2026-11-15)

The current catalog uses [capability and evidence rules](experimental-workspace/CATALOG_COMPATIBILITY.md). Eleven exercises are indexed; the first local batch enables six verified entries across linear algebra, calculus, statistics and algebra. The [eligibility record](experimental-workspace/compatibility/CATALOG_STATUS.md) retains disabled matrix/static-image/dropdown/scaffold/GraphTool candidates and their reasons. Earlier one-exercise counts and operator-only scope below are historical.

`workspace/server/exercise-catalog.json` holds compatibility status, explicit capability requirements, provenance and activation state. The shared list/lookup gate requires complete matching source/runtime/profile evidence and membership in an active batch. Status flags or supported macros alone cannot approve imported files. Source/runtime changes make old evidence stale; new imports default to unverified and disabled. Batch withdrawal blocks start/restore/grade while preserving saved sessions.

Verification: 100 server tests, 29 browser checks and 14 publisher/report tests pass, plus live default API checks for all six enabled exercises and rejection of all five disabled IDs. The fresh 44-case regression has 42 passes and two mobile GraphTool failures (seed 1234 positive grading; seed 4321 keyboard Tab reachability). The full gate remains nonzero and those entries stay disabled. The importer/publisher workflow is in CATALOG_COMPATIBILITY.md. The runtime hashes include the asset loader, server/frontend files, profile and lockfile; finish runtime changes before regenerating evidence. Keep the normal catalog and operator fixture manifest separate; deliberate promotion copies reviewed metadata/evidence, not privileged test inputs. All five disabled candidates remain private. The whole-library database importer remains future work. Next work: resolve mobile GraphTool touch grading, automatic scaffold stage reconciliation and narrow-layout limits; broaden source/seed coverage; then implement volume-backed indexing, database storage and reviewed activation batches using this contract. Public deployment still needs account ownership, isolation hardening and release checks.
## Implemented in the sandbox

1. Official pinned standalone renderer and PG submodule, built in Docker. OPL is cloned into an external Linux volume, outside Google Drive.
2. Verified server catalog: **dot-product-01**, title **Dot products and vector operations**, topic **Dot product**, four answer fields. Path: `Library/FortLewis/Calc3/13-3-Dot-product/HGM4-13-3-04-The-dot-product.pg`. Fixture seed 1234 is for verification; actual sessions generate their own seed.
3. Server-only renderer client: form requests, validation, timeout/error handling, loading, restoration, and grading. Renderer settings remain under server control.
4. Persistent exercise sessions: UUID, stable random seed, private renderer tokens, anonymous browser ownership, atomic JSON storage on a Docker volume.
5. Friendly topic/exercise picker with loading/empty/error states, responsive layout, real MathJax mathematics, and URL/history session restoration.
6. Answer collection across an isolated iframe, preserving generated names, whitespace, and ordered duplicate pairs. Fresh collection works even without a widget firing input/change.
7. Ownership-checked grading endpoint, trusted server-derived answer contract, missing-answer clearing, and per-session overlap protection.
8. Atomic persistence of updated renderer tokens plus the latest successful submission snapshot: ID, number, server timestamp, allowed field names, exact submitted pairs, PG score, and plain-text PG feedback. Legacy token-only records still restore. Only the latest snapshot is retained.
9. Practice controls: a prominent Check answer button beneath the frame submits fresh answer pairs, shows Checking… with a spinner, disables repeat submissions and exercise starts, and reports success or an inline error. The frame remains intact on success/failure, preserving edits made during the request. Browser history navigation cancels pending browser work and ignores late responses. No automatic grading retries.

10. Student feedback: per-field PG messages, separate invalid-input/mathematical-error states, overall result and percentage score, saved-result restoration, and changed-since-check markers without replacing inputs.

11. Accessibility/layout: Enter submits eligible single-line fields while preserving native widget/IME keys; conditional focus follows loading, results, and failures; Return to answers focuses the first field needing attention. A dedicated polite live region announces state changes without repeating the result while typing. Visible focus, stronger contrast, assistive MathML, 320px layout, forced colors, reduced motion, 16px answer text, and touch targets have browser coverage.

12. Complete-experience verification: 68 server tests, 23 browser checks, all focused live smoke checks, and actual renderer crash/recovery. New browser tests verify ownership across independent contexts and recovery of an accepted submission whose response was lost. See [PRACTICE_VERIFICATION.md](experimental-workspace/PRACTICE_VERIFICATION.md).

**UI boundary:** Students can now select, edit, check answers, and read field/overall results. Checked values restore from PG tokens; unsubmitted edits are not autosaved. Inputs remain editable during checking, so later edits are not necessarily included in that submission. No account-based progress or attempt history yet.

## Initial renderer compatibility study

Read [INTEGRATION_CONTRACT.md](experimental-workspace/INTEGRATION_CONTRACT.md), [COMPATIBILITY_MATRIX.md](experimental-workspace/COMPATIBILITY_MATRIX.md), and [compatibility/README.md](experimental-workspace/compatibility/README.md). The separate operator catalog contains eleven real files with stable IDs, attribution, source hashes/revisions, required capabilities, and seeds 1234/4321. All eleven generated at both seeds; sampled browser answers at 1234 and blank answers at 4321 were graded and restored. Eleven paired Chromium comparisons at seed 1234 used the full official reference and the actual app projection/frame/bridge/answer contract.

Seven native-answer paths include the existing dot-product baseline plus six candidates. Static GIF delivery, generated graph images, GraphTool dependencies/state, and scaffold behavior are blocked. A positive scaffold diagnostic confirmed two fields becoming four after a correct first part (score 0.5), retained on restoration. The current picker does not apply changed problem HTML after grading, so dependency loading alone cannot support staged problems.

In that initial study, the only runtime code change exported the existing `problemHtml` function for reuse by operator QA; projection behavior and public routes were unchanged. New tests protect private compatibility files and reject fixture IDs at the student API. The current student allowlist still contains **one exercise**. No new fixtures are approved for students.

Initial-study verification: **69 server tests**, live API smoke (exercise count 1), eleven paired browser comparisons, twenty-two seed probes, and the standalone positive scaffold diagnostic passed. Sanitized observations are recorded in local files; screenshots remain under the host temporary directory. The previous 23-check browser acceptance and renderer outage results below are historical and were not rerun for this study. Full correct-answer, owned-session, mobile, and accessibility acceptance is still needed for each new candidate.

## Controlled asset loader

[ASSET_LOADING.md](experimental-workspace/ASSET_LOADING.md) documents the new server-only registry in `workspace/server/exercise-assets.mjs`. Owned session responses mint opaque read capabilities and expose only ordered reviewed dependency URLs. Exact image aliases and generated images are supported. Approved jQuery/Bootstrap, PG GraphTool/Scaffold/details scripts/styles, pinned-and-hash-checked JSXGraph 1.7.0, and GraphTool stylesheet SVG icons run inside the existing opaque sandbox. Script order and defer semantics are preserved. A per-frame help-preference adapter resolves GraphTool's blocked localStorage access without granting same-origin privileges.

Capabilities expire after one hour; the registry is process-local and bounded. Missing resources or initialization errors keep grading disabled even after the loading deadline. Retry restores the owned session and obtains fresh capabilities. Math fallback waits for other frame loads. Renderer tokens, paths, seeds, and upstream queries/aliases stay private. Existing session storage and grading semantics are unchanged.

Post-loader comparisons are in [asset-loading-observations.json](experimental-workspace/compatibility/asset-loading-observations.json), with capabilities redacted. All eleven paired cases match sampled native names, answers, and grading/restoration scores without page errors. Static GIF (1/1), generated PNGs (2/2), scaffold collapse, GraphTool boards, both toolbar icons, and point interaction work. The initial observations remain the historical baseline. Operator fixture IDs remain outside the student allowlist.

Verification: **76 server tests**, **24 browser checks** including resource failure/deadline/retry, API smoke, renderer-client/session/grading/submission-state smoke checks, and eleven paired fixture cases with generation at two seeds. The prior renderer crash/outage proof was not repeated because Compose startup behavior is unchanged. Dynamic scaffold content returned after grading is still not applied to the live frame; full owned-session/mobile/correct-answer widget acceptance remains before promotion.

## Widget answer verification

Read [WIDGET_VERIFICATION.md](experimental-workspace/WIDGET_VERIFICATION.md) and sanitized [widget-observations.json](experimental-workspace/compatibility/widget-observations.json). The existing native collector handles numeric/formula/vector strings, nine independent matrix fields, radio groups, ordered repeated checkbox pairs, dropdowns, and eligible hidden fields. `workspace/public/widget-answers.js` adds only the pinned GraphTool association: observe its direct hidden-value assignments, put feedback beside the graph, and focus visible controls. Feedback now preserves choice labels/group layout. No graph syntax is synthesized and no backend answer allowlist comes from the browser.

The new `compatibility/widget-acceptance.mjs` runs the actual picker/owned API/client/session/feedback stack in a temporary container-local HTTP app. Server-only `exerciseLookup` and `exerciseList` factory hooks supply the operator catalog; normal defaults still expose one approved exercise. Fresh random session seeds remain stable. All eleven fixtures pass blank, wrong/invalid, correct (score 1), saved-answer/feedback restoration without regrading, clearing (score 0), cleared restoration, and owner rejection. GraphTool also passes real wrong/partial/correct point plotting, stale feedback after clear, hidden-change notification, and Return to answers focus. The matrix is nine scalar inputs, not a compound editor.

Scaffold Part 1 scores 0.5; explicit refresh exposes Part 2 and permits score 1. Clearing Part 1 relocks two fields on refresh. The report compares still-available cleared fields and records removed blank fields. Automatic stage advancement/relocking is still outstanding; do not claim a seamless staged UI or enable all fixtures yet.

Current validation: **77 server tests**, **26 browser checks**, all five live Node smoke checks, and eleven real owned HTTP widget cases. Prior fixed-seed comparisons and outage verification remain separate historical evidence. No private answers, session files, JWTs, cookies, or instructor maps are committed in the observations. Next work remains post-grade reconciliation and per-widget keyboard/mobile acceptance before catalog promotion.

## Styling boundaries

Read [STYLING_CONTRACT.md](experimental-workspace/STYLING_CONTRACT.md) and sanitized [styling-observations.json](experimental-workspace/compatibility/styling-observations.json). Shell styling remains in `picker.css`; `exercise.css` is now a separately served required stylesheet in the opaque frame. Broad input/label/paragraph/link/MathJax resets were replaced by explicit markers for ordinary prose, native answers, focus and app-owned feedback. Table/inline-styled inputs retain appearance; graph/editor/opt-out regions are protected. Do not set frame-wide fonts or foreground: that changed upstream GraphTool button metrics in the audit. Preserve author styles and generated PG structure.

`compatibility/style-audit.mjs`, enabled by `STYLE_AUDIT=1` in widget-acceptance.mjs, compares protected table/graph/button/board/SVG geometry and paint with exercise overrides enabled/disabled, measures 820px/320px layouts, then runs the full owned grading/restoration flow. All eleven fixtures pass; all reach score 1 and clear to 0. Narrow matrix/static-image/GraphTool frames require horizontal scrolling without making the parent page overflow; those candidates still need deliberate mobile treatment.

Current validation: **77 server tests**, **28 browser checks**, live API smoke (one public exercise), and eleven style-audited owned widget cases. Earlier five-smoke and outage proofs remain historical for areas unchanged in this styling task. No fixtures were promoted. Next remains automatic scaffold content reconciliation, followed by per-widget mobile/keyboard/visual review before broad enablement.

## Automated compatibility regression

The repeatable command is `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-compatibility.ps1` from the repository root. See [COMPATIBILITY_REGRESSION.md](experimental-workspace/COMPATIBILITY_REGRESSION.md), the [status record](experimental-workspace/compatibility/REGRESSION_STATUS.md), and [offline HTML report](experimental-workspace/compatibility/report.html). The matrix covers all eleven selected fixtures at seeds 1234/4321 in desktop and touch-mobile contexts (44 cases). Server-only seedGenerator injection supports deterministic operator sessions; the production cryptographic seed default and HTTP schema remain unchanged.

New regression helpers test rendering/images/MathJax initialization, native and graph keyboard interaction, touch inputs, loading retry, renderer network failure without saved-state changes, explicit retry, accepted/lost response recovery, exact refresh state, clearing, stable seed and a second authenticated owner (both GET/POST rejected before renderer calls). Style audit preserves the original viewport so mobile flows stay mobile. Report assessment rejects missing/duplicate cases, missing checks and unregistered observed gaps. HTML/Markdown/JSON reports remain sanitized; artifacts stay in a fresh temporary directory each run.

The automated gate exposes an unresolved mobile GraphTool touch-positive grading failure for both selected seeds. Those cases remain failed, while retries/refresh/clearing/ownership checks continue to collect evidence. The precise capability registry also lists refresh-required scaffold stages, horizontal scrolling (matrix/static image/graph and touch-mobile elasticity), manual screen-reader/device review and untested PG families. Do not waive failed grading to make the suite green or enable the operator fixtures in the student catalog.

Baseline verification is 79 server tests, 28 browser checks, and four report-assessment tests. The final matrix completed 44/44 cases: 42 passed; both touch-mobile GraphTool positive cases failed grading and completed all other required categories. The command exits nonzero as intended; 18 cases carry observed capability limits. Full details are in the generated status record. Earlier one-seed desktop-positive and styling observations remain historical and do not prove touch-positive correctness. Next work is the mobile graph interaction failure and automatic staged-content reconciliation; the real daemon outage check remains separate.

## Start or resume locally

Windows PowerShell, repository on Google Drive. Start Docker Desktop and wait for its Linux engine to be ready. A missing `dockerDesktopLinuxEngine` named pipe means the Docker daemon is unavailable.

From the repository root:

```powershell
cd experimental-workspace
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 240
docker compose ps
```

- Practice UI: http://localhost:3100 (use this exact configured origin).
- Private renderer editor: http://localhost:3101; health: `/health`.
- Original Next.js app: http://localhost:3000, started separately with root npm scripts.
- Sandbox source is copied into the image because Google Drive bind mounts appeared empty. Rebuild after edits. For workspace-only changes: `docker compose up --build -d --wait --wait-timeout 120 workspace`.
- Logs: `docker compose logs --tail 100 workspace renderer`.
- Stop while retaining data: `docker compose down`. `docker compose down --volumes` deletes saved sessions.

The external `linear-algebra-experimental_opl` volume contains the `webwork-open-problem-library` subdirectory, mounted read-only into the renderer. It persists through Compose volume removal because it is external. A fresh machine needs the [OPL volume initialization](experimental-workspace/README.md#open-problem-library-volume) before Compose startup. Never clone the full library to Google Drive; its roughly 88,000 tracked files include assets and macros, not just exercises.

Session JSON is private under `/data/sessions` in `linear-algebra-experimental_sessions`. Do not commit, expose, or casually delete it. An ownership cookie is required to retrieve HTTP-created sessions; knowing their UUID alone grants no access.

Pinned upstream revisions are documented in the workspace README: renderer `1134ffbbf5e656148e579f424f70bcd9f1d15936`, OPL `0d42812d6d02960c846fc0f89215e0d4f1e761b1`.

## Code map and API contract

All paths below are relative to `experimental-workspace/`:

| Area | Files |
| --- | --- |
| Containers and mounts | `compose.yaml`, `Dockerfile` |
| Catalog and friendly metadata | `workspace/server/exercise-catalog.json`, `exercise-catalog.mjs` |
| PG requests and normalized responses | `workspace/server/renderer-client.mjs` |
| Ownership, tokens, persistence, grading | `workspace/server/exercise-sessions.mjs` |
| Trusted answer fields and validation | `workspace/server/answer-contract.mjs` |
| Saved submission schema/legacy compatibility | `workspace/server/submission-state.mjs` |
| Safe PG field results | `workspace/server/grading-feedback.mjs` |
| API, student HTML projection, static assets | `workspace/server/http-app.mjs` |
| Picker and next UI work | `workspace/public/index.html`, `picker.css`, `picker.js` |
| Isolated PG content and messages | `workspace/public/exercise-frame.js`, `answer-fields.js`, `answer-bridge.js`, `field-feedback.js` |
| Browser integration tests | `browser-tests/picker.test.mjs` |

Endpoints:

- `GET /api/exercises`: friendly catalog entries, without source paths.
- `POST /api/sessions`: JSON `{ "exerciseId": "dot-product-01" }`.
- `GET /api/sessions/:id`: restore the owned session.
- `POST /api/sessions/:id/answers`: JSON `{ "answers": [["AnSwEr0001", "2 + 3"]] }`, using the actual collected field names. No client seed, path, token, settings, or field manifest.

Session responses contain `session: {id, exerciseId, createdAt}`, `exercise: {html, score, resources}`, and `submission: null` or `{id, number, submittedAt, fieldNames, answers, score, feedback: {message, summary}, fieldFeedback: [{name, status, score, message}]}`. Tokens and seeds remain private. Score is a fraction from 0 to 1.

In `picker.js`, `collectCurrentAnswers()` returns `{sessionId, answers: {fieldNames, entries}}`; submit `answers.entries` as the API's `answers`. Do not convert pairs into an object, which would lose repeated names. Snapshots are browser input; only restored server-trusted HTML defines allowed fields.

Ownership uses `la_experiment_owner`, an HttpOnly/SameSite=Strict cookie, with only its hash stored. Requests are same-origin with strict JSON validation and an 8 KiB body limit. Wrong-owner/unknown sessions return 404; overlapping grades return 409 `SESSION_BUSY`. Current concurrency protection assumes one Node process. Renderer failures leave the old saved state intact; do not automatically retry grading.

## Verification recorded before this documentation update

The complete-experience verification passed **68 server tests and 23 Chromium browser checks**, five live smoke scripts, and the PowerShell renderer smoke check. An abrupt renderer failure/recovery check also passed after fixing the startup PID issue. The full suites and the focused outage rerun are recorded in [PRACTICE_VERIFICATION.md](experimental-workspace/PRACTICE_VERIFICATION.md). New checks cover the keyboard-only flow, Enter/native/IME exceptions, forged shortcut messages, focus preservation and error recovery, conditional accessible descriptions, nonrepeating announcements, assistive mathematics, 320px layout, contrast, forced colors, reduced motion, and 200% CSS zoom. The real exercise test includes invalid syntax, parsed incorrect coordinates, blank fields, partial/correct/incorrect scores, stale feedback on edits, and refresh without another grading request. New browser checks cover fresh values, keyboard activation, duplicate clicks, editing during a request, server/network failures, explicit retry, mobile sizing, and navigation during grading. Desktop/mobile previews were also inspected. Previous backend verification passed renderer-client, sessions, API, grading, and submission-state smoke checks and the PowerShell renderer check. Live grading covered wrong/partial/correct results (0, 0.25, 1) and clearing previously saved answers.

A real forced workspace-container replacement also preserved the same owned session, latest submission metadata, score/feedback, and exact regenerated answer values, including whitespace and empty strings. The workspace-container replacement proof is historical. Server/browser suites and all focused backend/renderer smoke checks were rerun for complete-flow acceptance. The new real renderer outage test verifies 503 recovery, 404 ownership denial while offline, and the unchanged accepted snapshot and mathematical question after restart. Rerun relevant checks after code changes.

Run from `experimental-workspace/` after rebuilding:

```powershell
docker compose exec -T workspace npm test
docker compose exec -T workspace npm run smoke:renderer-client
docker compose exec -T workspace npm run smoke:sessions
docker compose exec -T workspace npm run smoke:api
docker compose exec -T workspace npm run smoke:grading
docker compose exec -T workspace npm run smoke:submission-state
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./smoke-renderer.ps1
docker build -f browser-tests/Dockerfile -t linear-algebra-picker-qa .
docker run --rm --network linear-algebra-experimental_default --shm-size=1g linear-algebra-picker-qa
```

The separate browser image keeps Playwright out of app dependencies. It forwards the actual localhost origin through the Docker network; preserve this setup for cookie/origin/secure-context behavior. Instructor answer maps are allowed only in operator diagnostics; never return or log them through student APIs.

## Repeatable acceptance and restart fix

From the repository root, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-practice.ps1 -IncludeRendererOutage`. The outage option temporarily force-stops only the renderer; the script restores it in `finally` without deleting volumes. Use `-RendererOutageOnly` for focused recovery checks. Private cookies/submission data stay in memory.

The test exposed a stale `/usr/app/script/hypnotoad.pid` in the renderer container. Hypnotoad treated a reused PID as an existing server, sent a hot-reload signal, and exited 140 on restart. Compose now removes only that runtime file and uses `exec hypnotoad` at startup. Keep the wrapper when updating the upstream image. A normal restart after an abrupt outage is now verified; the runner attempts container replacement on recovery failure but still fails that check.

The student flow handles both a failed request before grading and an accepted grade whose response is lost. Inputs survive both; refresh retrieves the last accepted result without another submission. Explicit retries are new submissions, so general idempotency is still future work.

## Feedback contract and next work

The private renderer `JWT.answer` contains PG results at `score.answers`. `grading-feedback.mjs` reads that configured-server response and projects only field name, status, score, and plain-text PG message. It is not JWT authentication and never accepts a browser grading token. Correct answers and other private claims remain on the server. No instructor request is needed by the student flow.

PG MathObjects uses `error_message` for coordinate hints as well as parser errors. A reported error plus an explicitly absent parsed `student_value`, or an explicit PG error flag, identifies invalid input. Successfully parsed incorrect coordinates remain mathematical errors. Never classify syntax validity from message wording. Per-field statuses are `correct`, `incorrect`, `partial`, `invalid`, `unanswered`, and `ungraded`; suppression of individual results is respected.

The snapshot persists safe `fieldFeedback` with the updated tokens. Older snapshots without it remain valid and obtain field details on the next check. The iframe inserts plain text with accessible field descriptions and invalid-input markers. Editing a checked field marks it changed and flags the overall score as the last checked result. Parent messages remain authenticated by source/origin/channel; the frame stays opaque and live values are preserved.

The keyboard/accessibility implementation is complete for the verified flow. Actual NVDA/VoiceOver listening has not been performed; run that manual review before public release. The initial representative study is complete; its matrix records six native candidates and four blocked fixtures. Approved asset delivery and ordered dependencies are implemented as described above; next implement staged content updates. Compound answers and custom evaluators still need additional coverage.

Use the completed operator compatibility set as a regression fixture while resolving the recorded blockers. Verify each candidate through the real student session flow before enabling it or designing the importer around assumed support. Do not publish all 81k exercises in bulk: indexing, topic relevance, renderer compatibility, source attribution, and licenses still need review. Later integrate Supabase account ownership/progress and durable attempts, plus concurrency suitable for multiple server processes.

## Immediate continuation

1. Implement post-grade problem-content reconciliation for scaffolds and dynamic questions, using the completed asset loader for newly required resources. Keep the isolation and edit-preservation contracts. Complete owned-session, positive grading, keyboard, and narrow-screen acceptance for each candidate before enabling it.
2. Design a database catalog for all OPL subjects, with stable IDs, source revisions, multiple topic assignments, licensing/attribution, and verification status. Build a repeatable importer that can index unverified problems without enabling them for students.
3. Add paginated search/browsing and enable validated batches. Supabase account ownership, durable history, idempotency/concurrency, dependency hardening, and manual screen-reader review remain before broad public release.

Keep the existing single-exercise acceptance suite as the regression baseline. See [PRACTICE_VERIFICATION.md](experimental-workspace/PRACTICE_VERIFICATION.md) for the exact verified behavior and reproduction commands.

## Remaining limits

The renderer/editor supports raw PG execution and uses an older upstream dependency stack with reported npm vulnerabilities. This is a localhost development environment, not a production deployment. Hardening and dependency review are required before public hosting. The current HTML projection is not a general-purpose sanitizer; preserve the iframe sandbox and content policy. Graphs, special widgets, and file uploads are not generally supported by the current verified flow.

## Suggested prompt for a fresh session

```text
Read AGENTS.md, PROJECT_CONTEXT.md, experimental-workspace/AGENTS.md, and
experimental-workspace/README.md. Inspect git status and preserve any local
changes. Grading and submission-state persistence already exist. Continue in the Docker sandbox:
the Check answer controls already submit to POST /api/sessions/:id/answers.
Student-safe field/overall feedback is also implemented and restored.
Complete-flow acceptance is recorded in experimental-workspace/PRACTICE_VERIFICATION.md;
preserve the renderer PID cleanup and outage/recovery checks. Actual screen-reader
listening is still a manual release check. Read INTEGRATION_CONTRACT.md and
COMPATIBILITY_MATRIX.md in experimental-workspace, then reproduce the operator
compatibility probes. Read ASSET_LOADING.md: approved asset delivery and dependency
initialization are implemented. Read WIDGET_VERIFICATION.md: answer collection, grading, feedback and restoration
are verified in operator sessions. Continue with automatic stage updates and
per-widget mobile/keyboard acceptance before enabling the candidate exercises.
Keep the original Next.js/Supabase application separate.
```

---

# Original Next.js/Supabase application reference

The sections below describe the original application, not the Docker PG sandbox.

## Purpose

This is an open source linear algebra practice platform aligned with the Khan Academy linear algebra track. The app organizes content as:

`Units -> Themes -> Subthemes -> Exercises`

Students can browse practice themes, solve exercises, and save attempts through Supabase auth. Admin users can manage course structure and author exercises.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase Postgres/Auth/RLS
- `@supabase/ssr` for server/browser clients
- `react-hook-form` and `zod` for admin form validation
- `react-markdown`, `remark-math`, `rehype-katex`, and `katex` for markdown/LaTeX rendering

## How To Run

From the repo root:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Required environment variables in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Verification Commands

```bash
npm run lint
npm run smoke:admin
npm run build
```

Known build caveat: production build uses `next/font/google` for Geist fonts. In restricted-network environments, `npm run build` can fail while fetching Google Fonts even when the app code is otherwise valid.

## Important Files

- `src/app/page.tsx`: landing/status page and course overview.
- `src/app/layout.tsx`: root layout, header navigation, admin link visibility.
- `src/app/login/page.tsx`: Supabase email/password login and signup.
- `src/app/profile/page.tsx`: user stats, attempts, logout.
- `src/app/practice/page.tsx`: unit/theme listing with progress.
- `src/app/practice/[topic]/page.tsx`: selected theme/subtheme practice page.
- `src/app/practice/[topic]/exercise-attempt-card.tsx`: main solving UI and client-side grading.
- `src/components/content/markdown-content.tsx`: markdown + LaTeX rendering.
- `src/app/admin/exercises/page.tsx`: admin exercise page.
- `src/app/admin/exercises/actions.ts`: server actions for exercise create/update/autosave/publish/delete.
- `src/components/admin/exercise-editor.tsx`: exercise authoring UI.
- `src/app/admin/structure/page.tsx`: admin structure page.
- `src/app/admin/structure/actions.ts`: server actions for units/themes/subthemes.
- `src/components/admin/structure-manager.tsx`: structure management UI.
- `src/components/admin/vector-plane.tsx`: graph display for a single vector.
- `src/components/admin/multi-vector-plane.tsx`: multi-vector graph display and interactive plotting.
- `lib/supabase/server.ts`: canonical server Supabase client.
- `lib/supabase/client.ts`: canonical browser Supabase client.
- `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts`: re-exports for `@/lib/...` imports.
- `src/types/database.ts`: Supabase database typings.
- `supabase/schema.sql`: initial dev schema.
- `supabase/migrations/`: later database changes for admin UI/RLS/status handling.
- `supabase/seed.sql`: starter course/content data.
- `DATABASE_SETUP.md`: detailed Supabase setup, admin promotion, RLS, and verification notes.
- `scripts/smoke-admin.sh`: admin smoke check.

## Implemented Features

- Course browsing by units, themes, and subthemes.
- Published exercise listing per subtheme.
- Per-theme and per-subtheme progress based on correct attempts.
- Supabase auth login/signup.
- Profile page with total attempts, correct attempts, accuracy, streak, and recent attempts.
- Attempt saving for logged-in users.
- Admin-only course structure management:
  - units
  - themes
  - subthemes
- Admin-only exercise management:
  - draft and published statuses
  - autosave draft
  - create/update/delete
  - publish
  - markdown/LaTeX prompt preview
- Exercise formats supported by the main attempt card:
  - plain text/JSON answer comparison
  - vector coordinate reading from graph
  - point/vector plotting on an interactive plane
  - single choice
  - multi-select
  - equal-vector picking
  - multi-part exercises mixing several supported part types

## Database Notes

Detailed setup is documented in `DATABASE_SETUP.md`.

The initial schema is in `supabase/schema.sql`, but it is not the complete current database shape by itself. Apply migrations from `supabase/migrations/` after the base schema.

Recommended fresh setup order:

1. Run `supabase/schema.sql`.
2. Run `supabase/migrations/20260221_admin_exercise_panel.sql`.
3. Run `supabase/migrations/20260221_admin_structure_rls.sql`.
4. Run `supabase/migrations/20260221_remove_archived_status.sql`.
5. Run `supabase/seed.sql`.
6. Create/sign in a user.
7. Set that user as admin manually:

```sql
update public.profiles
set role = 'admin'
where id = '<auth-user-id>';
```

Important: `seed.sql` inserts starter exercises without an explicit `status`. After the admin migration, exercises default to `draft`, while practice pages only show `status = 'published'`. Publish seeded exercises or update the seed if starter exercises should appear immediately.

## Auth And Admin Rules

- Admin access is determined by `profiles.role = 'admin'`.
- Admin pages redirect unauthenticated users to `/login`.
- Non-admin users see an admin access required message.
- RLS policies allow public read access for course structure and exercises.
- Writes to units/themes/subthemes/exercises are admin-only.
- Attempts and profiles are user-owned.

## Exercise Data Model

Admin editing stores both author-facing and runtime fields:

- `prompt_md`: markdown source shown in editor.
- `solution_md`: markdown/text solution source shown in editor.
- `choices`, `hints`, `tags`: metadata/config JSON.
- `prompt`: normalized runtime JSON used by practice UI.
- `solution`: normalized runtime JSON used by grading.
- `status`: `draft` or `published`.

The conversion from editor input to runtime JSON happens in `src/app/admin/exercises/actions.ts`.

## Current Known Issues / Gaps

- `PracticeRunner` exists at `src/app/practice/[topic]/practice-runner.tsx` but appears superseded by `ExerciseAttemptCard`.
- Production build may fail in restricted-network environments because `next/font/google` fetches Google Fonts.
- Seeded exercises may be hidden because they default to `draft`.
- Original-app grading is mostly client-side and exact-match based. Server-side PG grading exists only in the separate sandbox.
- Some exercise formats rely on JSON config in the admin editor, so authoring UX may still need polish.
- The original Next.js app has lint/admin smoke checks; the separate PG sandbox has its own server and browser suites.

## OPL importer checkpoints (task 6)

6.1: server-only psql adapter and isolated persistent Docker catalog database are implemented. See [importer guide](experimental-workspace/opl-importer/README.md). Migrations and SQL-literal injection round-trip passed locally; the existing applications, OPL source and student/session volumes remain intact. Tasks 6.2–6.7 continue in this session. Hosted Supabase is not configured.

6.2 complete: pinned Git-object inventory verified 77,134 regular PG sources across all three roots. Full inventory stays in the importer state volume; only aggregate reports belong in Git. Repeatability/dirty-worktree/symlink/wrong-pin tests pass. No database source import or activation yet.

6.3 complete: lexical metadata/taxonomy extraction and edge-case tests pass; the full 77,134-source metadata inventory remains in the importer state volume. Classification counts and limitations are in its README. Missing and ambiguous values are retained, not guessed or approved. Source execution/compatibility is not established.

6.4 complete: additive import identity schema and bounded reconciliation tested against stable/replayed/changed/unchanged/copy/rename/reappearance fixtures. No bulk import or current source-head movement yet. New records do not inherit compatibility. Full workflow/checkpoint publication follows in 6.5.

6.5 complete: durable import orchestration and CLI are implemented with transactional staging, leases, complete-scope sealing, generation checks and atomic publication/removal/reporting. Seven test groups pass in a disposable database, including interruption/resume and bad-batch rollback. The real full-library metadata is prepared but not yet imported; 6.6 adds safe search and 6.7 runs final full-library verification.

6.6 complete: full-text/topic database discovery, source/generated metadata labels, indexed-versus-ready counts, generation-bound cursors and operator issues are implemented. Eight disposable-database test groups pass, including public projection and private-access denial. Apply migrations through 202611160010 (generated-field guard and reader-column fixes included). Full real-library import and report validation follow in 6.7; neither app UI is wired to this catalog yet.

## Verification pipeline checkpoints (task 7)

7.1: verification contract implemented in [verification-pipeline/README.md](experimental-workspace/verification-pipeline/README.md). It retains the nine mandatory checks, two seeds/two viewports, separates technical outcomes from four explicit review categories, and allowlists stored diagnostics. Three contract test groups pass. Subsequent queue/worker/dashboard/publication work continues in this session; no existing activation or student data changed.

7.2 complete: conservative capability/dependency detection produced 77,134 immutable manifests, including 1,414 potentially unsupported candidates. No new exercise was enabled; dynamic/unreviewed behavior remains explicit. Five contract/detection tests pass.

7.3 complete: durable queue, concurrency/lease fencing, expiry recovery, retained retries/cancellation and access tests pass (seven groups). Additive migrations through 202611160013 are applied only to the isolated local catalog; no existing application/data was reset.

7.4 complete: separate private renderer and bounded worker runtime/context registration are implemented and eight test groups pass. PG revision is measured as 4b3e564cf4e5a36807ca5a341734f8d604e8b77d; installed-tree mismatch keeps the initial context uncertified. It is a visible publication blocker, not a fabricated approval. No student/application service was restarted.

7.5 complete: the generalized queued runner passed 8 real cases (dot product and derivative, two seeds/two viewports) through all nine existing checks. Both jobs remain needs-review; no approvals/activation occurred. Strict result projection/DB shape guards and eight automated unit/database groups pass. Old cancelled attempts remain retained.

7.6 complete: independent review categories, latest-decision ordering/revocation, protected fixed-seed previews and cookie isolation pass tests. Nine unit/database groups and both preview smoke checks pass. Real jobs remain unapproved pending human mathematical/interaction/deployment review; none was invented.

7.7 complete: immutable full-attempt evidence materialization, source/context invalidation/requeue and exact renderer-health checks are implemented; ten tests pass and old eight passing cases are retained as unverified evidence. PG/runtime source comparison identifies a generated lockfile difference. Automatic approval review rejected relaxing certification, so the strict original gate remains unchanged/false; live publication is blocked pending a separately approved provenance solution and human reviews.

7.8 complete: the protected dashboard is live at localhost:3102 with queue/library/evidence/review/action views and the uncertified-environment blocker. Browser acceptance passes; dashboard-observations.json contains sanitized booleans only. The operator key stays in its Docker volume. Publication wiring follows in 7.9.
