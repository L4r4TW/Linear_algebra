# Operator compatibility fixtures

This directory contains an **operator-only** representative catalog and browser probe. It does not extend `workspace/server/exercise-catalog.json`, add a student endpoint, or enable unverified problems.

- [catalog.json](catalog.json): eleven stable IDs, friendly topics, source/attribution evidence, exact source URLs/revision/SHA-256 fingerprints, two verification seeds, and required capabilities. Empty author lists mean no problem author was declared in the inspected header; textbook authors are not substituted.
- [observations.json](observations.json): sanitized pre-loader browser/PG observations. No HTML, cookies, JWTs, or expected-answer maps are stored.
- [scaffold-transition.json](scaffold-transition.json): positive-stage diagnostic reporting only field names, score, and content change.
- [../INTEGRATION_CONTRACT.md](../INTEGRATION_CONTRACT.md): current preservation/exclusion contract.
- [../COMPATIBILITY_MATRIX.md](../COMPATIBILITY_MATRIX.md): human-readable reference behavior, working native paths, gaps, and next work.

The effective verification seeds are the catalog's top-level `verificationSeeds` array. Browser comparisons use its first seed; the other seed checks PG generation, blank grading, and restoration. Required capabilities describe what the exercise needs, not what the app already supports. License evidence is conditional and does not replace review of individual or parent-directory notices.

- [asset-loading-observations.json](asset-loading-observations.json): post-loader comparisons; opaque asset capabilities are redacted. The probe now uses the actual server asset registry as well as the frame/bridge. It forwards registered resources through a Playwright-only route; the real HTTP asset endpoint has separate server integration coverage.

## Reproduce

Start the ordinary Compose services and initialize the existing OPL volume first. Run from `experimental-workspace/`:

```powershell
docker compose up --build -d --wait --wait-timeout 240
docker build -f compatibility/Dockerfile -t linear-algebra-compatibility-qa .
$compatibilityArtifacts = Join-Path $env:TEMP 'linear-renderer-compatibility'
New-Item -ItemType Directory -Force -Path $compatibilityArtifacts | Out-Null
docker run --rm --network linear-algebra-experimental_default --shm-size=1g --mount type=volume,source=linear-algebra-experimental_opl,target=/opl,readonly --mount "type=bind,source=$compatibilityArtifacts,target=/artifacts" linear-algebra-compatibility-qa
```

The probe verifies source hashes directly from the read-only Linux volume, opens the official renderer in an editor-like same-origin iframe, exercises its real MathQuill/native/graph controls, and submits through its own form. It compares the current application projection, sandboxed frame, answer bridge, and field contract using a Playwright-only parent page. The `/__compatibility` parent exists solely in browser interception; it is not a route served by the application.

The normal probe uses student-mode renderer requests. To reproduce the separate positive scaffold diagnostic, which uses operator instructor values only in memory:

```powershell
docker run --rm --network linear-algebra-experimental_default --mount "type=bind,source=$compatibilityArtifacts,target=/artifacts" linear-algebra-compatibility-qa node compatibility/scaffold-transition.mjs
```

`results.json`, `scaffold-transition.json`, and paired `*-reference.png` / `*-app.png` screenshots are written to the temporary artifact directory. Screenshots are captured before entering test answers. Review/sanitize observations before replacing checked-in evidence. Do not copy raw renderer HTML or private responses into Git. Unsupported behavior is reported as evidence; probe completion does not certify every fixture as compatible.

The QA image pins Playwright 1.65.1 and parse5 8.1.1 and copies the actual application modules. The original boundary study added only a named `problemHtml` export. The subsequent controlled loader adds private asset registration, reviewed dependencies, and the opaque asset endpoint documented in [ASSET_LOADING.md](../ASSET_LOADING.md). Do not rebuild the workspace while a probe is running; container replacement interrupts its imports and invalidates the run.

## Full widget answer acceptance

[widget-acceptance.mjs](widget-acceptance.mjs) exercises real owned HTTP sessions and the actual picker for all eleven fixtures. It runs its own temporary server inside the QA container; the normal workspace catalog remains unchanged. See [WIDGET_VERIFICATION.md](../WIDGET_VERIFICATION.md) and sanitized [widget-observations.json](widget-observations.json).

After building the same QA image and creating the temporary artifact directory above, run:

```powershell
docker run --rm --network linear-algebra-experimental_default --shm-size=1g --mount type=volume,source=linear-algebra-experimental_opl,target=/opl,readonly --mount "type=bind,source=$compatibilityArtifacts,target=/artifacts" linear-algebra-compatibility-qa node compatibility/widget-acceptance.mjs
```

Optional `-e WIDGET_FIXTURES=compat-algebra-graphtool-01` selects a focused fixture. The full run writes `widget-results.json` containing scores, statuses, counts, and verification booleans only. Review the results/privacy scan before replacing checked-in evidence. Expected values, choice calibration, private tokens, and session files stay in the operator process/temp storage and are never logged. Unlike the paired probe, this runner uses fresh random session seeds and positive correctness cases. Scaffold stage changes explicitly require refresh; its report records that limitation.
## Styling audit

[style-audit.mjs](style-audit.mjs) adds protected-geometry and 820px/320px layout checks before the full widget flow. Build the QA image as above, then run:

```powershell
docker run --rm --network linear-algebra-experimental_default --shm-size=1g -e STYLE_AUDIT=1 --mount type=volume,source=linear-algebra-experimental_opl,target=/opl,readonly --mount "type=bind,source=$compatibilityArtifacts,target=/artifacts" linear-algebra-compatibility-qa node compatibility/widget-acceptance.mjs
```

This writes `styling-results.json`; reviewed sanitized evidence is [styling-observations.json](styling-observations.json). No screenshots or answer values are written. Protected measurements compare the exercise stylesheet enabled/disabled without changing PG markup. The audit uses a short bounded layout wait because animation-frame callbacks can pause in offscreen mobile iframes. See [STYLING_CONTRACT.md](../STYLING_CONTRACT.md) for allowed selectors and observed narrow-frame scrolling limits.
