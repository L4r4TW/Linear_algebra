# Repository development guide

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

Before whole-library schema/import work, read [CATALOG_MODEL_AUDIT.md](experimental-workspace/CATALOG_MODEL_AUDIT.md) and its observed metadata counts. Task 5.1 is discovery only. Task 5.2 is specified in [EXERCISE_IDENTITY.md](experimental-workspace/EXERCISE_IDENTITY.md): permanent UUID identities/aliases, immutable source versions, reviewed renames and retained history. Its bootstrap inventory is not a migration or new allowlist. Task 5.3 is specified in [TOPIC_TAXONOMY.md](experimental-workspace/TOPIC_TAXONOMY.md): preserve raw classifications, version curated trees/mappings, allow multiple section assignments and count distinct eligible identities. Its fixtures/checks are private design tooling, not published taxonomy or runtime integration. Task 5.4 is specified in [CATALOG_METADATA.md](experimental-workspace/CATALOG_METADATA.md), with a private reference projector/search and local preview in catalog-model/. Preserve unknown language/difficulty/time and separate textbook references, problem credits, rights evidence and availability. Preview artifacts are not live API/UI integration or activation. Next is compatibility/evidence and activation design (5.5). Preserve legacy authored courses and client-graded attempts; never relabel them PG-verified. Checked-in SQL is not evidence of deployed Supabase policy/grants. Audit reports must contain source metadata/aggregate record shapes only, never private session values. Finalize subsequent model decisions before additive migrations.

## Catalog handoff

The current local batch enables six of eleven indexed entries. Follow [CATALOG_COMPATIBILITY.md](experimental-workspace/CATALOG_COMPATIBILITY.md) for eligibility and publication, and retain [CATALOG_STATUS.md](experimental-workspace/compatibility/CATALOG_STATUS.md) as the visible decision record. Run the live catalog check after rebuilding. The full 44-case operator gate currently fails for two mobile GraphTool cases; keep these failures explicit. Runtime/profile/source changes invalidate approval and require new evidence before reactivation. Never replace fingerprint values manually or delete session records to regain eligibility.
