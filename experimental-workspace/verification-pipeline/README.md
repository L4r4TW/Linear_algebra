# Automated compatibility verification

The task 7 pipeline adds a persistent verification queue and a protected operator console to the separate local catalog database. Catalog inclusion and practice availability remain separate. Nothing here replaces the existing six-entry JSON practice application, changes its sessions, or deploys to hosted Supabase.

## Open the console

- Operator console: **http://localhost:3102**
- Independent review, seed 1234: http://localhost:3103
- Independent review, seed 4321: http://localhost:3104
- Username: **operator**
- Retrieve the generated local key from its Docker volume:

```powershell
docker compose -f experimental-workspace/verification-pipeline/compose.yaml exec operator node pipeline/operator-key.mjs
```

The key is not in Git. Review pages use HTTP Basic authentication with the same username/key. Their temporary sessions use separate ownership cookies, protecting the existing student's cookie. Passwords, bearer/session tokens, instructor maps, entered answers and screenshots are absent from committed reports.

The dashboard provides queue state/search/paging, retained attempts and exact evidence, capability/dependency gaps, review/cancel/retry actions, affected-job refresh, batch preparation/publication/withdrawal, and a library view. Discovery defaults to practice-ready; “Show indexed material awaiting support” is explicit. Library searches show up to 30 matches; refine the query for a smaller operator batch.

## Current publication blocker

**The strict installed-PG provenance check remains uncertified.** The installed tracked tree differs at an npm-generated lockfile. Runtime-source comparison excluding that artifact, the pinned build recipe and installed dependency hashes are recorded, but they do not override the original certification requirement.

Automatic approval review rejected relaxing that security-critical certification rule without explicit authorization. No exception was applied, no fingerprints were rewritten, and no real batch was activated. Independent mathematical, manual interaction/accessibility and deployment/rights reviews also remain pending. The dashboard displays these blockers; a technical pass is not approval.

Do not set `certified=true`, change fingerprints manually, fabricate review decisions, or copy synthetic test approvals into the real database. Resolving provenance requires a separately reviewed fix while keeping the intended source/environment binding intact.

## Setup and operation

Run commands from the repository root. Docker's Linux engine, the existing OPL Linux volume, and the task 6 catalog database/network must be available. The verifier image derives from the existing compatibility QA image; if missing, build it first:

```powershell
docker build -t linear-algebra-compatibility-qa -f experimental-workspace/compatibility/Dockerfile experimental-workspace
docker compose -f experimental-workspace/verification-pipeline/compose.yaml build tools renderer
docker compose -f experimental-workspace/verification-pipeline/compose.yaml run --rm tools migrate
docker compose -f experimental-workspace/verification-pipeline/compose.yaml run --rm tools detect 100000
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/verification-pipeline/setup-context.ps1
docker compose -f experimental-workspace/verification-pipeline/compose.yaml up -d operator preview1234 preview4321 worker
```

The importer must have completed before context registration. Its setup and volumes are documented in [opl-importer/README.md](../opl-importer/README.md). The migrations add verification metadata only; they never run the destructive authored-app reset or migrate student/account records.

`setup-context.ps1` starts only the private verifier renderer and records the installed image, pinned renderer/PG revisions, clean OPL snapshot, actual Node/Playwright/parser/browser identities, application/runner hashes and profile. The existing strict source-revision and certification checks remain active. Re-run context registration after a verified integration/image/profile deployment; do not disable revision checks to accept a new pin.

Enqueue and inspect a bounded reference batch:

```powershell
docker compose -f experimental-workspace/verification-pipeline/compose.yaml run --rm tools enqueue-aliases dot-product-01 compat-calculus-numeric-01
docker compose -f experimental-workspace/verification-pipeline/compose.yaml run --rm worker worker 2
docker compose -f experimental-workspace/verification-pipeline/compose.yaml run --rm tools queue
docker compose -f experimental-workspace/verification-pipeline/compose.yaml run --rm tools refresh --enqueue
```

The dashboard can queue resolved library entries directly. Unknown/missing manifests require another detector scan. Refresh requeues only previously targeted, affected entries, at most 20 per pass; it does not execute all 77,134 sources automatically.

## Detection and requirements

The versioned lexical detector produced candidate manifests for all **77,134** current sources. **1,414** had potentially unsupported capabilities at the initial scan. Literal macro/asset references are retained; dynamic lists, external/script references, unknown interactions and unreviewed behavior remain explicit. No source inspection result certifies renderability, installed dependency closure, mathematical validity or complete requirements.

Detection does not execute PG. Rendering happens only in the private renderer. The source/version hash is checked again by the real browser runner. Unsupported GraphTool/scaffold/custom interactions remain blocked; prior mobile GraphTool failures are not waived.

## Queue and worker guarantees

Jobs deduplicate on exact source-version, capability-manifest and environment context. Enqueue is bounded and transactional. Claims use row locking, durable leases, fencing tokens, priorities and a serialized global concurrency limit. Late, expired, cancelled or stale workers cannot replace newer results.

Defaults: one worker service, global limit two active claims, 900-second renewable leases, a ten-minute child-process deadline, and three retained attempts per job. Explicit retry requires a reason and cannot reset history or bypass the attempt cap. Cancellation stops acceptance immediately; process-group termination follows a lost lease/heartbeat. Infrastructure errors do not become mathematical errors or compatibility passes.

Checkpoints are at job-attempt boundaries. A crashed partial attempt is retained as expired/error and restarted as a new attempt; partial cases are not silently combined into complete evidence. There is no exactly-once guarantee for external PG calls. All sessions used by workers are disposable operator sessions, not student work.

Each worker has CPU, memory, PID, shared-memory and temporary-storage limits. The renderer and workers have internal networks, no published ports, no Docker socket, no repository-secret mount and no student-session volume. Only authenticated operator/review services join the console bridge and publish **loopback-only** ports. Their local administrative database/auth model is not a public-production deployment configuration.

## Automated checks versus review

The unchanged baseline is seeds **1234/4321**, **desktop/mobile**, with nine mandatory checks:

1. Rendering and approved dependency loading.
2. Interaction and feedback behavior.
3. Ordered answer collection and helper-field exclusion.
4. Positive/cleared PG grading round trips.
5. Explicit retries, service-error handling and accepted-but-lost responses.
6. Same-session/answer/feedback restoration without regrading.
7. Ownership enforcement and unchanged foreign-owner state.
8. Keyboard reachability and submission.
9. Narrow layout/touch interaction, retaining observed limitations.

The generalized runner uses the actual client, HTTP application, picker, opaque iframe, answer bridge, assets and session store through injected operator-only catalogs. Application production defaults are unchanged.

Privileged PG calibration data stays in disposable process memory. It tests transport/evaluator consistency; it is **not independent mathematical validation**. Unknown widgets, missing answer mappings and unregistered limitations remain failures/review work. Screen-reader listening and physical-device checks remain manual.

Four independent, attempt-bound review categories are required:

| Category | Operator responsibility |
| --- | --- |
| Requirements | Inspect source/dependencies and confirm complete, supported interaction requirements |
| Mathematical | Independently solve/assess the pinned variants and content; do not rely on PG's supplied answer map |
| Interaction | Review relevant manual/widget/accessibility behavior, including declared unautomated checks |
| Deployment | Review rights, access and intended local deployment policy |

Record an explicit actor, reason/evidence note and independent-review acknowledgement. Reviews are append-only, category-specific and ordered; rejection removes completeness. Reviews cannot waive failed checks or unsupported capabilities. A new attempt needs applicable reviews; old failures/reviews remain visible.

## Evidence, freshness and publication

Complete attempts materialize immutable registered worker runs, exact targets, four source-bound cases, single-attempt bundles, profiles, requirements and unverified assessments. Missing cases, failed scores, false checks, stale identities, unresolved support or limitations never become verified. No cross-attempt seed/viewport stitching occurs.

Source/manifest/context changes make old jobs stale and schedule bounded replacements. Renderer health compares every attestation value canonically across JSONB serialization; changing a value or dropping a field fails comparison. Publication requires a recent matching renderer observation. Worker/browser/integration changes receive a new recorded context, not edited evidence.

Prepare an exact batch only after all checks/reviews and the strict environment gate pass. Preparation is reversible and does not publish. Inspect the member list and expected publication generation, then explicitly publish. **The new manifest replaces the database scope's active manifest**; it does not silently retain unrequested members. Generation conflicts fail instead of overwriting another operator's publication.

Withdrawal keeps source/evidence/student records. A changed review withdraws an active database batch; accepting that review again does not silently reactivate it. A new explicit publication is required. The SQL `catalog_api.practice_opl` RPC defaults to eligible playable entries; `include_indexed=true` is the optional pending-support library view.

The original JSON application's six enabled exercises remain independent. Connecting database eligibility to its future list/start/restore/grade adapters is separate work; a dashboard publication does not rewrite its catalog files.

## Reproduce acceptance

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/verification-pipeline/verify.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/verification-pipeline/verify-acceptance.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/migration-tests/verify-migrations.ps1
```

The complete acceptance command builds/migrates/registers the environment, runs unit/database checks, performs private-renderer outage and killed-worker recovery, executes the eleven-entry reference batch, tests the protected dashboard, writes sanitized reports and leaves the worker running. `-SkipFailures` is explicitly a partial rerun that avoids interrupting the private renderer. Keep other verifier-dependent work idle during outage acceptance.

Synthetic publication/review/session fixtures run only in a random disposable database and roll back. Failure acceptance uses real pinned source metadata and the real private renderer in a separate disposable database, with no mathematical approvals. Cleanup removes its own probe containers/databases and restarts only the private renderer in finally.

Reports:

- [pipeline-observations.json](pipeline-observations.json): actual batch cases, outcomes, timing, context and source hashes.
- [failure-observations.json](failure-observations.json): real outage/retry, killed-worker expiry, competing-claim prevention and late-result fencing.
- [dashboard-observations.json](dashboard-observations.json): authentication, CSRF, library mode, keyboard/dialog and mobile checks.
- [migration observations](../migration-tests/migration-observations.json): fresh/legacy-upgrade access, retention and concurrency checks.

Pipeline acceptance can pass while individual exercises fail or remain unsupported. Those failures stay ineligible and visible. Batch timings are local bounded measurements, not full-library throughput promises or production SLOs. Earlier 173-server/62-browser and 42/44 legacy compatibility counts remain historical; they were not rerun or relabeled by this work.

## Measured 7.10 acceptance

Final acceptance passed 11 unit/database test groups, 134 fresh/legacy-upgrade migration checks, real private-renderer outage and worker-crash recovery probes, and authenticated desktop/mobile dashboard checks.

The eleven-target reference batch executed 36 seed/viewport cases: 28 passed and eight failed or recorded limitations. Seven targets passed the technical checks and await independent review. Matrix-grid and static-image exercises retain narrow-layout failures; GraphTool and scaffold targets remain unsupported and were not executed. No failed or unsupported target was enabled.

The measured serial worker elapsed time was 304,826 ms (about 5.08 minutes), or 2.17 targets per minute including unsupported skips. This is a local acceptance measurement, not a full-library throughput promise.

No real reviews or database activations were fabricated: all 77,134 sources remain indexed, database practice-ready count is zero, and the existing six-exercise application is intact. Strict PG provenance certification and independent reviews remain live-publication blockers.

## Recovery and continuation

For outages, restore the private renderer and explicitly retry the affected job. For expired workers, preserve the retained attempt and let the fenced replacement claim it; do not delete jobs. At the retry cap, investigate rather than resetting counters. Resolve source/runtime/profile changes by registering the measured matching deployment and producing new evidence.

Use the dashboard's failure/unsupported/stale filters and source links. Fix missing adapters/requirements under a new reviewed version, then reverify. Do not approve around a failed assertion. The current remaining live-activation blockers are strict PG provenance and independent reviews.

Before public deployment: replace the local shared operator key/trusted Docker-network database access with real authenticated roles and least-privilege worker admission, configure TLS and intended API exposure, and complete security/rights/accessibility review. Student HTTP/database integration and account progress remain separate tasks.
