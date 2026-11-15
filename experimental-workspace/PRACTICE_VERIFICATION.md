# Practice experience verification

Current continuity acceptance: [CONTINUITY_VERIFICATION.md](CONTINUITY_VERIFICATION.md) records 173 server tests, 62 browser checks, all six enabled exercises and actual desktop/mobile renderer outage recovery. The original one-exercise report below is historical; its counts describe that earlier milestone.

Verified on 2026-11-14 for the experimental Docker workspace and its pinned renderer/OPL revisions. **Result: PASS for the catalog exercise `dot-product-01` (Dot products and vector operations).**

The student flow works from selection through real PG grading and restoration. The complete suite passed **68 server tests, 23 Chromium browser checks, five live API/client/session smoke checks, and the PowerShell renderer smoke check**. The focused real-renderer outage/recovery check also passed after fixing the startup issue described below. No instructor response is used by the browser acceptance tests; they solve the public mathematical statement.

## Acceptance results

| Scenario | Evidence | Result |
| --- | --- | --- |
| Selection and multiple fields | Friendly picker starts one owned session; real mathematics and all four generated answer fields are usable. | PASS |
| Vector notation and exact values | Angle-bracket vectors, spaces between coordinates, leading/trailing whitespace, and blank fields survive collection, checking, and restoration. | PASS |
| Mathematical grading | Real PG returns 0%, 25%, 75%, and 100% results across incorrect, incomplete, partial, and correct submissions. | PASS |
| Invalid input versus incorrect mathematics | Undefined expressions show Invalid input; parsed wrong coordinates remain Incorrect and display PG coordinate hints. | PASS |
| Explicit retry | A 503 before grading preserves every input and the previous accepted submission; an explicit retry works. | PASS |
| Lost successful response | The backend saves a correct submission but its response is dropped. Inputs remain intact; refresh restores the accepted 100% result without another grading request. | PASS |
| Refresh and browser history | The same session, question, values, result, field feedback, and submission metadata restore without a replacement session or automatic grade. | PASS |
| Browser ownership | Separate owned and anonymous browser contexts cannot retrieve or grade another session. Both return 404, reveal no exercise content, and leave both owners' sessions unchanged. | PASS |
| Actual renderer failure | Abruptly killing only the renderer produces friendly 503 responses for owned grading/restoration. The workspace remains healthy; unauthorized requests still return 404. | PASS |
| Restart recovery | The same renderer container restarts normally after the abrupt failure. The accepted submission, count, score, feedback, and mathematical question/answer previews are unchanged. | PASS |
| Keyboard and mobile | Keyboard-only select/check/review, Enter/IME exceptions, focus preservation, live-region semantics, assistive MathML, 320px layout, touch targets, reduced motion, forced colors, and 200% CSS zoom are covered. | PASS |

## Issue found and fixed

The real outage check found a renderer restart failure that simulated HTTP errors could not expose. A stale `/usr/app/script/hypnotoad.pid` survived container stop/crash. Hypnotoad could interpret a reused process ID as a running server and send it a hot-reload signal, terminating startup with exit code 140.

The renderer command in [compose.yaml](compose.yaml) now removes only that runtime PID file before starting Hypnotoad with `exec`. The upstream renderer image and read-only OPL volume remain in use. The regression check forces an abrupt renderer outage and requires a normal restart; if that restart fails, the runner attempts container replacement to restore service and still reports failure.

## Repeat the verification

Docker Desktop's Linux engine and the initialized OPL volume are prerequisites. From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-practice.ps1 -IncludeRendererOutage
```

The runner starts the services, rebuilds the workspace and QA image, runs the server/browser suites and live smoke checks, then verifies the real outage. `-IncludeRendererOutage` briefly makes only the experimental renderer unavailable. Recovery runs in a `finally` block and never removes Docker volumes. Cookies and private response data stay in memory.

Omit `-IncludeRendererOutage` to run the ordinary suite without interrupting the renderer. To rerun only the real failure/recovery check:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-practice.ps1 -RendererOutageOnly
```

The final successful verification combined the full suites with this focused outage rerun after correcting a PowerShell single-pair serialization issue in the test fixture. Current coverage lives in [browser-tests/picker.test.mjs](browser-tests/picker.test.mjs) and [verify-practice.ps1](verify-practice.ps1).

## Scope and remaining work

- This validates one approved OPL exercise and the supported native controls, not the entire library or every PG widget/evaluator.
- Ownership is an anonymous HttpOnly browser cookie; Supabase account ownership and attempt history remain future work.
- A manual retry is a new submission. There is no general idempotency guarantee after a lost response; refresh recovers the last accepted result without resubmitting.
- Actual NVDA/VoiceOver listening has not been performed. Automated browser checks verify semantics, MathML, and focus behavior; manual screen-reader review remains a release check.
- The renderer remains a private localhost development service. Production hardening and broader exercise compatibility are separate work.

## Explicit recovery follow-up (2026-11-15)

The recovery-enabled runtime passes 136 server tests, 47 browser checks, 14 publisher/report tests and the six-entry continuity/API checks. The focused real renderer outage check was rerun and passed: owned grading/restoration returned RENDERER_UNAVAILABLE/503 while the renderer was stopped, foreign access remained 404, and normal restart preserved the accepted submission and question signature exactly. It required no fallback container replacement or volume removal. The complete 44-case compatibility gate retains the two failed mobile GraphTool cases. See [SESSION_RECOVERY.md](SESSION_RECOVERY.md) for safe token classifications, terminal choices and GET-only reconciliation.
