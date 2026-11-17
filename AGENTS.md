# Repository development guide

## Current short-term goal: four 100-exercise collections

The user authorized implementing and pushing the 400-exercise plan. Read experimental-workspace/practice-400/README.md and the newest PROJECT_CONTEXT.md section. Calculus has reached 100; other collections are processing. Do not revert to the old fixed-ten or human-moderator hold for these user-authorized tested collections. Never fabricate mathematical/independent reviews.

Preserve the measured verifier context/worker images, full technical gate, source/attempt bindings, private renderer/student data, and explicit withdrawals. Use the new collection pipeline and live counters; older fixed-ten acceptance scripts are historical. Do not assume background processing means all four quotas are complete. Keep pushing feature checkpoints and saving actual progress/evidence.

## Current user-authorized tested pilot

The user now explicitly authorizes tested local exercises without moderator approval, with student problem reports. This supersedes the earlier review hold and resolves its missing-policy-authorization condition; never record fabricated independent/human sign-offs. Follow [LOCAL_PILOT_POLICY.md](experimental-workspace/calculus-100/LOCAL_PILOT_POLICY.md) and the newest PROJECT_CONTEXT.md section. Live 3105 has sixteen exercises (six original plus ten tested calculus pilots); original 3100 still has six.

Preserve the separate pilot grants, technical/source/context/health/provenance guards, backend loopback opt-in and withdrawal without record deletion. Standard reviewed publication stays unchanged. Keep known defective/out-of-scope sources disabled. Reports are encrypted owner-bound student records; see accounts/PROBLEM_REPORTS.md. Never commit their contents or operator exports. Use verify-local-pilot.ps1 with stable services, then the appropriate account/discovery/migration checks. Historical instructions below requiring independent reviews apply to the standard publication route, not this explicit local pilot.

## Account integration checkpoint

Read [the current account/platform handoff](experimental-workspace/accounts/CURRENT_STATE.md) before using older counts below. Milestone 12 now connects the home to local accounts, private saved work and progress. Original 3100 remains an independent anonymous prototype. Follow the account guide for setup and immutable acceptance; preserve all existing data and the unchanged compatibility/provenance gates.


## Read before continuing

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the current handoff and [Project_goals.md](Project_goals.md) for product direction. Inspect `git status --short` before editing: newer implementation work may still be uncommitted. Preserve existing work.

There are two independent applications:

- Repository root: existing Next.js/React/TypeScript/Supabase app, port 3000. Root npm scripts apply here.
- `experimental-workspace/`: active Node/WeBWorK Docker experiment, practice UI on port 3100 and private renderer editor on port 3101. Read its [AGENTS.md](experimental-workspace/AGENTS.md) before changes in that directory and its [README.md](experimental-workspace/README.md) for exact commands and API contracts.

The current product direction includes all OPL subjects. The local student catalog currently enables six exercises under [capability-based eligibility rules](experimental-workspace/CATALOG_COMPATIBILITY.md); read [current continuity acceptance](experimental-workspace/CONTINUITY_VERIFICATION.md) and the [historical practice report](experimental-workspace/PRACTICE_VERIFICATION.md) before claiming broader compatibility. The [integration contract](experimental-workspace/INTEGRATION_CONTRACT.md) and [compatibility matrix](experimental-workspace/COMPATIBILITY_MATRIX.md) record the eleven-fixture operator study and current blockers. The [widget verification](experimental-workspace/WIDGET_VERIFICATION.md) records subsequent positive grading, feedback, and restoration plus the scaffold refresh limitation. The [styling contract](experimental-workspace/STYLING_CONTRACT.md) separates shell/prose/native styling from protected widget geometry. Only the six explicitly activated entries are student-approved locally; other operator fixtures stay disabled. PROJECT_CONTEXT.md records the latest scope and next work.

Keep PG experiments in the experimental workspace unless integration into the main app is explicitly requested. Do not replace the existing app's exercise or Supabase flows as part of sandbox work.

## Local environment and data

- Windows PowerShell; the repository is on Google Drive. Docker Desktop uses its Linux engine/WSL2.
- Never clone the full OPL or renderer source into this synced directory. Renderer builds use the pinned upstream Git context; OPL is in the external `linear-algebra-experimental_opl` Docker volume.
- Sandbox source is copied into its image. Rebuild after edits; do not assume host hot reload or working Google Drive bind mounts.
- Private session JSON lives in `/data/sessions` on `linear-algebra-experimental_sessions`. Normal restart/rebuild preserves it. `docker compose down --volumes` deletes sessions; avoid destructive cleanup.
- Preserve the renderer startup PID cleanup and `exec` command in Compose. A stale Hypnotoad PID file caused a verified restart failure; do not remove data volumes to fix it.
- Do not expose renderer/editor services publicly or mount repository secrets or the Docker socket into the sandbox.

## PG integration invariants

- Exercise IDs come from the verified server catalog. Paths, seeds, renderer settings, tokens, and privileged instructor responses stay on the server.
- Generate a seed once per session; restore using saved tokens. Never silently replace a failed saved session with a new exercise.
- Verify session ownership before renderer requests. Current ownership is an anonymous HttpOnly browser cookie, not Supabase authentication.
- Keep PG content inside the isolated iframe. Preserve its sandbox, content policy, and message source/origin/channel/request checks.
- Answer pairs preserve generated names, whitespace, order, and valid repeated names. Derive the allowed field contract from server-restored PG HTML, not client metadata.
- Persist updated renderer tokens and the latest submission snapshot atomically. Preserve legacy token-only records; do not fabricate submission history.
- The in-memory grading guard supports one Node process. Account ownership, durable attempt history, and distributed concurrency control are future integration work.

## Validation

For sandbox changes, run commands from `experimental-workspace/`:

```powershell
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 240
docker compose exec -T workspace npm test
```

For renderer/client/session smoke checks and API-level outage recovery, run from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-practice.ps1 -IncludeRendererOutage
```

The outage option briefly force-stops only the experimental renderer, then restores it without removing volumes. Omit the option for ordinary checks; use `-RendererOutageOnly` for focused recovery checks. A failed normal restart must still fail verification even if fallback container replacement recovers service. Keep private cookies and renderer data in memory. Actual screen-reader listening remains a separate manual release check.

Current failure/navigation acceptance is in [CONTINUITY_VERIFICATION.md](experimental-workspace/CONTINUITY_VERIFICATION.md). From the repository root run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-continuity.ps1` for server/browser/catalog checks and real desktop/mobile outage recovery; `-OutageOnly` skips the ordinary suite. It requires matching runtime evidence, briefly stops only the experimental renderer and restores it without removing volumes. Keep other renderer-dependent checks idle during the interruption. The separate six-entry focused audit is reproduced in CONTINUITY_FEEDBACK_AUDIT.md.

Latest implementation evidence at `3eefcbb`: 173 server tests, 62 browser checks, six focused continuity cases and two actual outage viewports passed. The 14 publisher/report checks and full seeded 42/44 gate are earlier results for the unchanged runtime, not reruns of that acceptance change. Actual screen-reader listening and physical mobile review remain unperformed. Tabs do not synchronize live drafts; restoration prefers a newer checked result with a warning. Do not promise a merge, older-conflicting-draft recovery, cross-device drafts or general request idempotency.

Use [verify-compatibility.ps1](experimental-workspace/verify-compatibility.ps1) for the full seeded desktop/touch compatibility gate; read [COMPATIBILITY_REGRESSION.md](experimental-workspace/COMPATIBILITY_REGRESSION.md) and its explicit failed/unsupported capability records. Do not waive required checks to turn the gate green. Run the focused smoke checks and browser suite required by the nested guide for the area changed. Do not substitute root app lint for sandbox tests. Documentation-only edits need link/command checks and `git diff --check`; historical test results must be labelled as such.

For original app changes, use root `npm run lint`, `npm run smoke:admin`, and `npm run build` as applicable. The build can fail on Google Fonts downloads in restricted networks. `supabase/schema.sql` drops existing tables: follow [DATABASE_SETUP.md](DATABASE_SETUP.md) and use migrations for existing data.

## Handoff maintenance

Update PROJECT_CONTEXT.md when implementation status, verification, or next steps change. Keep README entry points and nested workspace guidance consistent. Record what is implemented versus exposed in the UI, and what is committed/pushed versus only present locally. Never include private session files, cookie values, credentials, renderer tokens, or instructor answer maps in documentation or Git.

## Catalog model design

Before whole-library schema/import work, read [CATALOG_MODEL_AUDIT.md](experimental-workspace/CATALOG_MODEL_AUDIT.md) and its observed metadata counts. Task 5.1 is discovery only. Task 5.2 is specified in [EXERCISE_IDENTITY.md](experimental-workspace/EXERCISE_IDENTITY.md): permanent UUID identities/aliases, immutable source versions, reviewed renames and retained history. Its bootstrap inventory is not a migration or new allowlist. Task 5.3 is specified in [TOPIC_TAXONOMY.md](experimental-workspace/TOPIC_TAXONOMY.md): preserve raw classifications, version curated trees/mappings, allow multiple section assignments and count distinct eligible identities. Its fixtures/checks are private design tooling, not published taxonomy or runtime integration. Task 5.4 is specified in [CATALOG_METADATA.md](experimental-workspace/CATALOG_METADATA.md), with a private reference projector/search and local preview in catalog-model/. Preserve unknown language/difficulty/time and separate textbook references, problem credits, rights evidence and availability. Preview artifacts are not live API/UI integration or activation. Task 5.5 is specified in [COMPATIBILITY_DATA_MODEL.md](experimental-workspace/COMPATIBILITY_DATA_MODEL.md). Its normalizer calls the actual gate and preserves evidence/tested bindings separately from current requirements; it cannot publish, waive failures, invent missing history or certify a new environment. Task 5.6 is specified in [STUDENT_RECORDS_PRIVACY.md](experimental-workspace/STUDENT_RECORDS_PRIVACY.md): parent-consistent ownership, explicit claims, backend-only renderer state, separate drafts/attempts and suppression-aware progress. Synthetic reference actors are not real authentication or RLS; never accept their proof fields from HTTP. No account/ownership migration was applied. Task 5.7 is specified in [DATABASE_DESIGN.md](experimental-workspace/DATABASE_DESIGN.md). Its PostgreSQL lab has no network/ports/application volumes and removes its fresh container in finally; guarded model_lab SQL is not a deployed migration or proof of Supabase authorization. Use the documented runner, preserve NULL-safe owner/version FKs and all current gate rules. Task 5.8 is implemented in [DATABASE_MIGRATIONS.md](experimental-workspace/DATABASE_MIGRATIONS.md): ordered additive SQL, forced RLS, narrow owner projections and backend-only atomic primitives, validated in disposable fresh/legacy-upgrade databases. No hosted deployment or runtime adapter is present. Do not expose private schemas, treat simulated Auth context as JWT verification, or accept synthetic consent/proof events from HTTP. Task 6 is now implemented in the [importer guide](experimental-workspace/opl-importer/README.md): 77,134-source local catalog, resumable imports, identity review, safe search, 9 importer test groups and 13 full-library assertions. It uses separate catalog/state volumes and a read-only OPL mount; never mount sessions or run local Auth fixture SQL on hosted Supabase. Next is HTTP discovery/frontend integration and account/practice adapters. Preserve legacy authored courses and client-graded attempts; never relabel them PG-verified. Checked-in SQL is not evidence of deployed Supabase policy/grants. Audit reports must contain source metadata/aggregate record shapes only, never private session values. Follow the migration guide and inspect hosted version/history/grants before any deployment.

## Catalog handoff

The current local batch enables six of eleven indexed entries. Follow [CATALOG_COMPATIBILITY.md](experimental-workspace/CATALOG_COMPATIBILITY.md) for eligibility and publication, and retain [CATALOG_STATUS.md](experimental-workspace/compatibility/CATALOG_STATUS.md) as the visible decision record. Run the live catalog check after rebuilding. The full 44-case operator gate currently fails for two mobile GraphTool cases; keep these failures explicit. Runtime/profile/source changes invalidate approval and require new evidence before reactivation. Never replace fingerprint values manually or delete session records to regain eligibility.

## Queued verification pipeline

Task 7 is implemented in [experimental-workspace/verification-pipeline/README.md](experimental-workspace/verification-pipeline/README.md). Use its independent Compose services and disposable acceptance databases. Preserve the original nine checks, two seeds/viewports, complete single-attempt evidence, fenced leases and append-only reviews. Calibration is not independent mathematical proof. Never mount student/session data or the Docker socket, expose the private renderer, waive unsupported/failed cases, fabricate reviews, or overwrite historical evidence. The dashboard is loopback-only with a generated operator key outside Git. Original strict PG provenance certification remains false; automatic approval review rejected the proposed generated-lockfile exception. Preserve that gate and factual source/runtime binding unless a later user-authorized reviewed resolution applies. Follow the guide for unit, actual private-renderer outage/worker-crash, reference batch and desktop/mobile console checks. Existing app/runtime counts remain historical; database publication does not rewrite the JSON practice allowlist.

## Home and discovery

Milestone 8 lives in experimental-workspace/discovery/; follow its README and use setup.ps1 / verify.ps1. The loopback home is localhost:3105, forwarding a fixed set of existing player routes to the unchanged sandbox. Do not insert scripts into PG/player HTML or change the compatibility fingerprint to accommodate the home. Test the gateway's real session grading/restoration and ownership separately from historical player regression counts.

Keep discovery SQL read-only and anon-scoped; no private base-table/service-role access, session volumes, operator secrets, Docker socket or host source mounts. Live /api/exercises authorizes the prototype collection. Indexed or database-verified rows must not acquire a start action without the appropriate reviewed session adapter. Source classification is not curated taxonomy approval. Preserve generation-bound cursors, parameter validation, explicit errors, text-only metadata and the practice/indexed distinction. Continue is an owner-checked local recent pointer, not account progress; do not migrate existing 3100 tab drafts silently. API/browser reports must contain sanitized flags/hashes only. The runtime's old 173/62 and 42/44 counts are historical, not discovery acceptance.

## Differential-calculus rollout

Follow [the calculus rollout guide](experimental-workspace/calculus-100/README.md) and the latest PROJECT_CONTEXT.md. The new candidate achieves strict PG-clean provenance using pristine pinned source and npm ci, preserving both original lock hashes. This does not certify the historical renderer or waive OS/dependency, independent review or publication gates. Private player_catalog is backend-only; public discovery must authorize starts from the live player list. Preserve source-version/context bindings and old session identities. Never mount real account secrets/student volumes into multi-network catalog probes; verify-player.ps1 generates a fresh isolated account environment and scoped keys. No real review is inferred from synthetic disposable-database fixtures.

The classified 100-source technical set is now complete; see calculus-100/technical-status.json and review-pack.json. User explicitly keeps it pending review. Do not approve or publish it. Use resume.ps1 to preserve measured images/context; -NewContext intentionally rebuilds and invalidates old proof. Catalog-enabled practice must fail closed on missing/outdated authority, including legacy aliases of withdrawn publications. Never substitute cached legacy admission for unknown publication state.

Latest user request revokes the earlier review hold and asks for activation. However, automatic approval review rejected persisting accepted review records under an automated actor as a substitute for genuine independent sign-offs. Ten sources have concrete source analysis and 40 independent student-oracle PG/browser cases, but no accepted database reviews or activation. See calculus-100/review-findings.json and the current PROJECT_CONTEXT.md. Do not bypass the rejection or relabel automated evidence as human sign-off; obtain explicit local-pilot review-policy authorization or genuine operator reviews.
