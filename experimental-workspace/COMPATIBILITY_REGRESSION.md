# Automated compatibility regression

The repeatable entry point is [verify-compatibility.ps1](verify-compatibility.ps1). It tests the selected [operator catalog](compatibility/catalog.json) separately from the default student catalog and the root Next.js application. Deliberate promotion now uses the [catalog compatibility contract](CATALOG_COMPATIBILITY.md); running tests alone never activates entries.

From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-compatibility.ps1
```

Docker Desktop's Linux engine and the initialized pinned OPL volume must be available. The command validates/builds Compose, runs server tests, runs the browser regression suite, builds the separate operator QA image, runs report-assessment tests, and executes the compatibility matrix. It neither deletes volumes nor clones OPL into Google Drive. Builds reuse Docker's cache; the first renderer build takes longer.

## Default coverage

The complete matrix is **11 exercises × seeds 1234/4321 × desktop/touch-mobile = 44 owned-session cases**. Seed values are fixed operator fixtures, injected only by the temporary test server; the normal application still generates random private seeds and accepts only exercise IDs in session-start requests. Every source file is checked against its catalog SHA-256.

| Check | Automated proof |
| --- | --- |
| Rendering | Projected problem present, required images loaded, MathJax initialized with no unprocessed legacy math markers (HTML-only notation may have zero SVG expressions), GraphTool boards initialized when required, and opaque iframe origin retained. |
| Initialization/retry | Fail the required exercise stylesheet once, then use Retry exercise to restore the same session. |
| Interaction and capture | Operate the real native fields/options or GraphTool toolbar; preserve generated names, ordered repeated pairs, vector/formula strings and hidden graph state. |
| Grading and feedback | Blank, wrong/invalid, fully correct and cleared submissions; mixed/partial results where applicable, with per-field feedback. GraphTool includes a separate partial-credit point case. Touch-positive failures stay failed; continuing that case only collects additional evidence. |
| Failed grading/retry | Inject a server-side renderer network error, verify HTTP 503, unchanged saved state and preserved input, verify no automatic retry, then explicitly save one retry. |
| Lost response | Let the real owned endpoint grade/save once, discard its response, preserve input, and recover that exact accepted submission through refresh without another grade. |
| Refresh | Same session/seed, ordered answer values, saved submission and field feedback/statuses after refresh; cleared answers remain cleared. |
| Ownership | A second browser creates its own ownership cookie; both retrieval and grading of the first browser's session return 404 without renderer calls or changing its saved result. |
| Keyboard | Enter activates Return to answers and Check answer. Tab reaches each currently available answer group; text editing, checkbox Space, radio arrows and select keys work. GraphTool plotting uses toolbar keyboard activation, arrow movement and Enter; keyboard Clear/confirmation leaves its hidden answer blank. |
| Mobile/layout | Full flows run in a 390px Chromium touch/mobile context, including native taps and graph touch plotting. Both 820px and 320px layout measurements check parent overflow and record internal frame scrolling. Native text sizing and protected widget geometry/SVG properties are audited. |

Desktop cases also measure narrow layout; the mobile cases provide the actual touch flow. This is a curated interaction path, not exhaustive fuzzing of every possible tool/gesture sequence. Group reachability does not replace manual screen-reader listening or testing physical mobile devices. Bring graph controls back into view before confirmations: their upstream message UI uses animation frames which can pause in an offscreen iframe.

## Visible results and unsupported capabilities

Each run creates a new directory under the system temporary `linear-compatibility` directory and prints the paths to:

- `index.html`: offline HTML results table, colored failures/known limitations, and explicit unverified capabilities.
- `REGRESSION_STATUS.md`: readable per-exercise/seed/viewport status.
- `regression-results.json`: sanitized observations and strict matrix/check assessment.

Reviewed snapshots are [REGRESSION_STATUS.md](compatibility/REGRESSION_STATUS.md), [report.html](compatibility/report.html), and [regression-observations.json](compatibility/regression-observations.json). The capability policy is [unsupported-capabilities.json](compatibility/unsupported-capabilities.json).

A completed flow can be **passed with limitations**. The known policy currently records refresh-required scaffold advancement/relocking and horizontal frame scrolling for the matrix, static image, GraphTool and touch-mobile elasticity layout. It separately records manual screen-reader/device review and untested widget/macro families. The mobile GraphTool positive touch case is also recorded as unsupported: it currently fails the expected full-score assertion. Its remaining checks continue, and the suite still returns failure. These are not silently skipped checks and do not approve fixtures for student enablement.

Missing/duplicate/unexpected matrix cases, failed required checks, incomplete runs, source mismatches, and newly observed unregistered limitations return a nonzero status. Known capability limits never excuse a failed keyboard, retry, grading or ownership check. Report tests cover those rules and HTML escaping. The shell command also scans JSON for private renderer data before treating artifacts as publishable.

## Focused runs

Run directly in PowerShell for array parameters:

```powershell
./experimental-workspace/verify-compatibility.ps1 -ExerciseId dot-product-01,compat-algebra-graphtool-01 -Seeds 1234 -Viewports mobile
```

The report labels reduced coverage as a focused run. It is not evidence for the omitted exercises/seeds/viewports. `-ArtifactsDirectory` selects a base directory; each run receives a fresh timestamped subdirectory so stale results cannot look like a new pass.

The Node runner can also be used by an already provisioned Docker automation environment:

```powershell
# From experimental-workspace, after building compatibility/Dockerfile and creating the temp artifact directory:
docker run --rm --network linear-algebra-experimental_default --shm-size=1g -e COMPATIBILITY_REGRESSION=1 --mount type=volume,source=linear-algebra-experimental_opl,target=/opl,readonly --mount "type=bind,source=$compatibilityArtifacts,target=/artifacts" linear-algebra-compatibility-qa node compatibility/widget-acceptance.mjs
```

Optional operator environment variables are `WIDGET_FIXTURES` (comma-separated IDs), `COMPATIBILITY_SEEDS` (JSON integer array), and `COMPATIBILITY_VIEWPORTS` (`desktop,mobile`). They are not public API settings. The separate `verify-practice.ps1 -IncludeRendererOutage` command remains the real daemon interruption/restart check; this suite injects controlled service failures and does not claim to repeat that outage proof.

## Maintenance and privacy

Keep the fixture catalog, source revisions/hashes, capability policy and this regression matrix in sync. Add a real fixture and explicit assertions for a newly supported interaction. Resolve a new gap or register its precise capability/evidence after review; do not broaden error allowlists to make a failed test green.

The operator runner uses the actual API/client/session/picker/frame/asset/bridge/feedback code in a temporary container-local HTTP application. Its private session files are removed at the end. Instructor expected values and bounded choice calibration stay in operator memory. No expected answers, raw submitted pairs, renderer HTML, cookies, JWTs or private session records are written to reports, and no answer-entry screenshots are generated. Public fixture seed labels are deliberate verification metadata, not production session secrets.

## Recorded run

The preceding 2026-11-15 baseline run completed all 44 cases: **42 passed and 2 failed**. Both failures are touch-mobile GraphTool positive grading (seeds 1234 and 4321); all eight other required check categories completed in those cases. The command correctly returned nonzero. Eighteen cases carry observed capability limits, including the two failed cases. Baseline validation passed **79 server tests, 28 browser checks, and 4 report-assessment tests**. The normal API smoke check still exposes only the approved student exercise.

## Catalog activation verification

The latest fingerprinted run attempted all 44 cases: 42 passed and both touch-mobile GraphTool cases failed. Seed 1234 failed positive grading; seed 4321 failed earlier at keyboard Tab reachability. The full sanitized report and per-case phases/checks retain those exact failures; the strict command still exits nonzero. Six individually verified exercises are now enabled through the reviewed local batch, while all five candidates with limits or failures remain disabled. See [CATALOG_STATUS.md](compatibility/CATALOG_STATUS.md). The publisher verifies both runtime and exact fixture-manifest fingerprints before producing reviewable evidence. Existing manual release checks and the separate real renderer-outage check still apply.

## Draft-enabled runtime verification

After native tab drafts were implemented, all 44 seeded cases were rerun against the new runtime fingerprint. Forty-two pass; both mobile GraphTool positive-grading cases fail. The full gate remains nonzero, the six active entries have renewed matching evidence, and the same five limited/unsupported candidates remain disabled. Current checks pass 108 server tests, 37 browser checks, 14 publisher/report tests and the revised six-entry continuity audit. Read [DRAFT_PERSISTENCE.md](DRAFT_PERSISTENCE.md) for tab scope and precedence. Earlier seed-4321 keyboard failure details above describe the prior run.

## Recovery-enabled runtime verification

The complete 44-case matrix was rerun after explicit saved-session recovery. Forty-two cases pass; both mobile GraphTool positive-grading cases fail and remain disabled. The seeded lost-response path now requires the Reload saved session GET action before another check and confirms the stored submission without regrading. The six active entries have renewed matching runtime evidence. Current checks pass 136 server tests, 47 browser checks, 14 publisher/report tests and the six-entry continuity audit. See [SESSION_RECOVERY.md](SESSION_RECOVERY.md) for verified token errors, ownership privacy and recovery behavior.

## Feedback-model follow-up

The feedback-enabled runtime has renewed seeded evidence for the same six active entries. The full 44-case gate retains the two known mobile GraphTool failures. Validation passes 153 server tests, 49 browser checks, 14 publisher/report tests and 20 additional real-PG feedback cases at two seeds, with stale/revert verification. The verification script now runs that separate feedback audit before the full matrix; its extra suppression fixture is operator-only. Read [FEEDBACK_MODEL.md](FEEDBACK_MODEL.md) for withheld scores, coherent state/score rules and named-field binding.
