# Continuity acceptance: failures and navigation

Implementation/evidence committed and pushed in `3eefcbb`. Documentation refreshes do not imply a new test run. Verified 2026-11-15 against the normal experimental application and its pinned renderer, PG and OPL. Continuity subtask 8 passes the automated checks below. No application runtime, activation rule or enabled exercise changed.

## Evidence and coverage

| Scenario | Verification | Result |
| --- | --- | --- |
| Refresh before and after grading | Fresh [six-exercise audit](compatibility/continuity-audit.json): original question/session, unfinished answers, checked pairs, feedback and later edits restore without grading. | PASS, all six |
| Lost successful grading response | [Browser suite](compatibility/practice-suite-observations.json) drops the response after the real backend accepts it; explicit GET/refresh reconciles the saved attempt and later edits without another grade. | PASS |
| Real renderer outage | [Desktop and touch-mobile audit](compatibility/failure-continuity-observations.json) starts checked sessions, edits scalar/vector answers, then the host actually SIGKILLs the renderer. HTTP 503 keeps live work; offline refresh/retry retains session URL and draft. | PASS, two viewports |
| Recovery after actual outage | Explicit GET restores the same question, draft and prior submission; only explicit Check advances the accepted count once. Checked refresh does not resubmit. [Host evidence](compatibility/outage-orchestration.json) confirms normal restart of the same renderer container, with no replacement fallback. | PASS |
| Draft saving unavailable | Full browser suite blocks sessionStorage: warnings remain visible, live edits survive grading/recovery failures, and leaving requires consent. Collection failures cannot silently authorize leaving. | PASS |
| Back/forward and pending requests | Suite verifies protected leave cancellation/confirmation, same-session restoration, rapid history, late responses, pending-grade navigation and duplicate prevention. | PASS |
| Multiple actual tabs | Two pages share one owner cookie but separate sessionStorage. Independent drafts survive refresh; a newer checked result wins on reload with a visible warning. A stale tab checks only by explicit action; the other tab restores that newer result. | PASS for this policy |
| Ownership during failure | Owned foreign and anonymous GET/POST return 404 even while renderer is offline. Normal suite also verifies ownership and unchanged accepted state. | PASS |
| Keyboard and announcements | Enter submission, explicit keyboard retry, Return to answers focus, error alert/descriptions, polite result live region and assistive MathML are checked. Suite retains native widget/IME exceptions and focus guards. | PASS, automated semantics |
| Narrow screens | Actual outage/recovery runs at 360 px with touch emulation; main layout fits and Check has a 48 px target. Suite covers mobile feedback, keyboard and controls. | PASS, Chromium emulation |

The fresh run passed **173 server tests, 62 browser checks, the live six-entry catalog check, six focused continuity cases and two real-outage viewport cases**. The 14 publisher/report checks and full seeded compatibility evidence are prior milestone results: the unchanged runtime still matches that evidence. The full operator gate remains **42/44**, with two mobile GraphTool touch-grading failures; GraphTool stays disabled. This acceptance does not expand the six-exercise student catalog or certify every random OPL variant.

## Reproduce

Start Docker Desktop's Linux engine. From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-continuity.ps1
```

The runner checks the normal workspace fingerprint, runs server/catalog/browser checks, builds isolated QA images, and briefly stops only the experimental renderer after both browser sessions are prepared. It restarts the renderer before checking recovery and restores service in `finally` on failure. It never removes data volumes. A fallback container replacement recovers service but does not pass normal-restart acceptance. `-OutageOnly` skips the ordinary server/catalog/browser suite; label that run as focused. An optional `-ArtifactsDirectory` must name a fresh directory. Rebuild the workspace after runtime edits and renew compatibility evidence before running; this command deliberately refuses a stale runtime.

Run the separate six-entry audit using the commands in [CONTINUITY_FEEDBACK_AUDIT.md](CONTINUITY_FEEDBACK_AUDIT.md). The outage runner writes a sanitized browser-suite report, two-viewport report and host restart record to a temporary directory. Commit only reviewed observations, not phase files, screenshots or raw logs. The browser containers have no Docker socket; cookies, session IDs, answer pairs, tokens and raw responses remain in memory.

## Explicit limits and release checks

Tabs do not merge or synchronize live drafts. A tab keeps its live inputs until an explicit check or restoration; a newer unrelated server-checked submission takes precedence on reload and is explained visibly. The older conflicting draft has no recovery UI. This is tested behavior, not conflict-free collaborative editing. Closing a tab, clearing storage or blocked storage can lose unfinished work. Accounts, cross-device drafts, durable attempt history, distributed locking and general request idempotency remain future work.

Actual NVDA/VoiceOver listening and physical mobile-device testing were **not performed**. Check spoken mathematics, error/result announcement timing, focus movement and touch interaction manually before a public release. Automated ARIA/MathML/focus assertions establish semantics, not actual screen-reader output.
