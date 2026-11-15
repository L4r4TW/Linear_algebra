# Explicit saved-session recovery

Continuity subtask 3 distinguishes temporary service failures from saved sessions that cannot be resumed. Recovery never silently starts another exercise or replaces the stored seed/token. The existing tab-draft and owned-session rules still apply.

## Recovery contract

| Condition | Public API response | Student action |
| --- | --- | --- |
| Renderer connection failure or upstream 502/503 | 503 `RENDERER_UNAVAILABLE` | Try again explicitly; loading retries GET the same session ID |
| Renderer timeout or upstream gateway 504 | 504 `RENDERER_TIMEOUT` | Try again explicitly, with loading/checking wording appropriate to the operation |
| Confirmed expired renderer token | 410 `SESSION_EXPIRED` | Explain expiration, keep saved record/draft, offer Choose another exercise; no repeated-token retry button |
| Confirmed invalid signature, token format or issuer rejection | 409 `SESSION_REJECTED` | Explain that the saved session cannot be resumed; preserve data and offer a deliberate exercise choice |
| Missing session, missing browser ownership cookie or wrong browser owner | 404 `SESSION_NOT_FOUND` | Explain that the session may be missing or unavailable to this browser; suggest the original browser or choosing an exercise |
| Owned session whose exercise is no longer enabled | 410 `EXERCISE_WITHDRAWN` | Explain current unavailability; retain record/draft and offer another catalog exercise |
| Unknown exercise on initial start | 404 `UNKNOWN_EXERCISE` | Choose an available exercise; do not keep retrying an unapproved ID |
| Invalid session link/request | 400 `INVALID_INPUT` | Explain invalid link and offer the catalog |
| Other renderer/storage/protocol failures | Existing safe 500/502 error | Generic service recovery with explicit retry; do not guess that a session expired |
| Lost, timed-out or unconfirmed browser grading response; concurrent checking | Browser uncertainty / 409 `SESSION_BUSY` | Block another check and offer Reload saved session; no automatic grading retry |

An initial start that fails before the browser learns a session ID is different from restoring a known ID. Its error panel explicitly says retrying starts a new session for the selected exercise. There is no hidden fallback from a failed GET to POST. Choosing another exercise only focuses the catalog; an actual new session requires the student to select an exercise/version.

## Ownership privacy

The session service now distinguishes `SESSION_FORBIDDEN` internally from a missing record. The HTTP boundary deliberately masks missing and unowned sessions with exactly the same status, code and message. A caller must pass ownership before learning that a stored exercise was withdrawn or contacting the renderer.

The UI therefore cannot tell a stranger that a session exists or belongs to another person. The recovery message explains both possibilities and points to the original browser. There is no account login/cookie recovery feature in this anonymous prototype. Renderer authorization failures are not treated as browser ownership failures.

## Verified token behavior

The pinned upstream renderer reports JWT failures as HTTP **500**, including expiration. Classifying all 500s, 401s, 403s or any text containing “expired” as session expiration would be incorrect.

`renderer-client.mjs` recognizes only the reviewed structured JSON exception shape (`status: 500`, bounded `message`) on a stored-`sessionJWT` request to the configured renderer. It removes the request log prefix and matches the exact Crypt::JWT expiry pattern or reviewed rejection strings. Only normalized error codes cross into our API; original bodies, log IDs, signatures, claims, private causes and token values are never returned to the student.

Reviewed source locations in renderer revision `1134ffbbf5e656148e579f424f70bcd9f1d15936`:

- `lib/RenderApp/Controller/Render.pm`: session-token decoding, `croak` and structured exception response.
- `lib/WeBWorK/RenderProblem.pm`: session-token generation.
- `/usr/local/share/perl/5.30.0/Crypt/JWT.pm`: exact expiration/signature/format error strings.

The default session-token generator sets `auto_iat`, but does not set an explicit expiration claim. This change does not add an expiration clock. Expiration handling was verified with a deliberately expired, correctly signed local test token; bad-signature and malformed-token probes were verified separately. [token-error-observations.json](compatibility/token-error-observations.json) stores only sanitized statuses and recognition booleans.

The [probe](compatibility/probe-token-errors.pl) runs entirely inside the local renderer, loads that application's signing configuration in-process, and sends test tokens to its loopback API. Signing keys and generated tokens stay inside the renderer container; test tokens are sent only to its loopback API. They are never printed or copied into our workspace. Existing application session records are not modified. To repeat from `experimental-workspace/`:

```powershell
docker compose cp compatibility/probe-token-errors.pl renderer:/tmp/continuity-token-probe.pl
docker compose exec -T renderer perl /tmp/continuity-token-probe.pl
docker compose exec -T renderer rm -- /tmp/continuity-token-probe.pl
```

Unknown upstream token-like errors remain generic service failures until their actual response contract is verified; do not add broad substring matching. Ordinary permission/configuration errors must not falsely expire a student's session.

## Loading and checking behavior

`ExerciseRequestError` preserves safe API code/status in the browser. `sessionRecovery()` defines terminal versus transient choices, rather than discarding the code and always showing Try again. Error headings receive focus only when the student has not interacted elsewhere; alerts and keyboard-accessible recovery buttons use existing application styles.

On a terminal load error, the original URL and tab draft remain intact. There is no renderer-token reset, session deletion, draft transfer, seed regeneration or automatic request loop. A mismatch between the requested session/exercise and the returned response is rejected before rendering.

On a failed check, the current iframe and fields remain editable. A confirmed service error allows another deliberate Check answer. A terminal error disables further checks in that frame and offers the catalog. Bridge collection errors remain locally retryable because no grading request was sent.

An uncertain grading result blocks another POST until the student reloads the saved state. **Reload saved session sends GET only**. The current iframe remains in place while GET is pending or failing. After a successful owned response for the same session/exercise, the bridge collects the latest live values and carries a bounded in-memory draft into the new frame. This preserves edits made during loading and works even when tab storage is blocked. Invalid/oversized snapshots keep the live frame and show a message rather than replacing it with lost work.

The existing pending-draft precedence recognizes a saved submission matching the uncertain attempt, restores later edits over it and marks its feedback stale. If another unrelated newer submission exists, the established newer-result rule applies. This is reconciliation of the latest visible result, not general request idempotency or distributed concurrency control. The server still keeps only the latest submission and guards grading in one Node process.

## Validation and remaining work

Server tests cover real renderer-shaped errors, rejection of misleading/non-JSON error bodies, ownership masking, withdrawal, and unchanged saved session bytes on restore/grade failures. Browser checks cover terminal and transient recovery, no automatic GET/POST loops, original-session retry, retained drafts, editable terminal grading failures, GET-only uncertain-grade recovery, blocked storage plus a failed GET, keyboard catalog focus and mismatched-session responses.

The seeded compatibility runner now explicitly uses Reload saved session after an accepted-but-lost response, verifies that another check is blocked first, and compares the restored answers/submission without regrading. It still retains unsupported widget failures. Use the regular server/browser suites, live catalog check and [verify-compatibility.ps1](verify-compatibility.ps1); runtime approval must match the new fingerprint.

No existing exercise is regenerated to recover an expired token. Automatic expiry/renewal policy, account recovery, durable attempt history, general grading idempotency, a UI for reviewing an older conflicting draft and cross-device draft synchronization remain separate work. The next product subtask is to refine grading outcomes and PG feedback presentation, followed by available authored hints and deliberate move-on controls.
## Final verification

136 server tests, 47 browser checks, 14 publisher/report tests, the six-entry live API check and current continuity audit passed. The real renderer outage/restart check also passed: owned restore/grade returned 503 while offline, unauthorized requests stayed 404, and normal restart restored the exact question and accepted submission. No volumes were removed. The complete seeded matrix has 42 passes and the two known mobile GraphTool grading failures, which remain blocked. Actual screen-reader listening and general grading idempotency remain separate work.

Repeat the focused real outage check from the repository root with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-practice.ps1 -RendererOutageOnly`. It briefly stops only the experimental renderer and restores it in finally; keep other renderer-dependent tests idle while it runs.
