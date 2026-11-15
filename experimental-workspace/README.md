# Experimental Docker workspace

Session handoff and next steps: [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md). Repository-wide guidance: [AGENTS.md](../AGENTS.md).

## Current catalog scope

Six exercises are enabled in the first local verified batch; five more candidates remain indexed and disabled. See [catalog compatibility rules](CATALOG_COMPATIBILITY.md), [eligibility record](compatibility/CATALOG_STATUS.md), and [server catalog](workspace/server/exercise-catalog.json). Source/runtime evidence and explicit batch membership govern availability. Current validation: 108 server tests, 37 browser checks, 14 publisher/report tests and the live six-entry API check pass. The full operator regression retains two failed mobile GraphTool cases. Earlier one-exercise counts below describe historical verification stages.

To verify the enabled batch after rebuilding, run `docker compose exec -T workspace node server/check-catalog.mjs` from this directory. It checks listing, start, blank grading, restoration, ownership and rejection of disabled IDs. For the future full-library importer, start with [CATALOG_COMPATIBILITY.md](CATALOG_COMPATIBILITY.md); indexed exercises remain disabled until verified and included in an active batch.

The [continuity and feedback audit](CONTINUITY_FEEDBACK_AUDIT.md) records the current six-exercise baseline: checked work and PG feedback restore. Unchecked edits now also survive refresh through [session-bound tab drafts](DRAFT_PERSISTENCE.md). Its original missing-draft baseline is historical; specific recovery actions, authored hints and protected navigation remain future work. Reproduce the focused browser audit with the commands in that document; it records known gaps rather than implementing fixes.

## Historical integration milestones

The following paragraphs record earlier verification stages; current availability is governed by the catalog scope above.

Independent sandbox for the official WeBWorK standalone renderer and PG integration. The existing Next.js application and Supabase configuration are separate. The project direction covers all OPL subjects; the original verified catalog contained one exercise. Start with the [practice acceptance report](PRACTICE_VERIFICATION.md) for the complete student-flow baseline. The [integration contract](INTEGRATION_CONTRACT.md) records the renderer/client/frame boundary; the [compatibility matrix](COMPATIBILITY_MATRIX.md) compares eleven real OPL fixtures with the official renderer. Reproduction commands and the separate operator catalog are in [compatibility/README.md](compatibility/README.md).

The compatibility study found six additional native-answer candidates and four blocked fixtures: static images, generated graphs, scaffolds, and GraphTool. These fixtures remain outside the student allowlist. The latest focused run passed 69 server tests and the live API smoke check; the study also ran eleven paired browser comparisons and twenty-two seed probes. The existing 23-check full acceptance suite is prior evidence, not a rerun for this study.

## Controlled renderer assets

The [asset-loading mechanism](ASSET_LOADING.md) supports approved problem images, ordered stylesheets/scripts, and initialization inside the existing opaque frame. Source paths, seeds, renderer tokens, alias maps, and upstream query strings remain on the server; public resource URLs are short-lived capabilities. Grading stays disabled after resource failures, and Retry exercise restores the same session.

The [matrix follow-up](COMPATIBILITY_MATRIX.md#controlled-loader-follow-up) records working static/generated images, scaffold toggles, GraphTool boards/icons, and matching sampled hidden answers. Newly revealed scaffold content still needs post-grade reconciliation. No new fixtures are enabled for students. Current validation: 76 server tests, 24 browser checks, live smoke checks, and eleven paired fixture comparisons across two generation seeds.

## Widget answers and feedback

[WIDGET_VERIFICATION.md](WIDGET_VERIFICATION.md) records the answer representation and collection/grading/feedback/restoration proof for each tested interaction. The GraphTool adapter observes direct hidden-value changes and connects feedback/focus to the visible graph; native numeric/formula/vector fields, nine-field matrix, choice groups, and dropdowns retain the original ordered-pair collector. All eleven operator fixtures reach full correctness and restore saved answers/feedback; cleared values remain cleared. Scaffold stage advancement/relocking explicitly requires refresh and is not automatic support.

Current checks pass 77 server tests, 26 browser checks, the live smoke checks, and the real HTTP widget acceptance runner. The normal student allowlist still contains only `dot-product-01`.

## Styling rules

[STYLING_CONTRACT.md](STYLING_CONTRACT.md) defines which typography, spacing, colors and containers the application owns. Shell styles stay in `picker.css`; the frame loads a separate `exercise.css` for opt-in plain prose/native controls and app-owned feedback. Renderer base typography, table input geometry and widget/editor/graph internals remain protected. Author classes/inline styles and reviewed preserve-style regions are excluded from appearance opt-in.

Validation passes 77 server tests, 28 browser checks, API smoke, and eleven style-audited widget cases. Matrix/GraphTool geometry matches upstream computed styles with overrides disabled. Narrow matrix/static-image/GraphTool frames still scroll horizontally; see the report before claiming mobile support.

## Automated compatibility gate

Run from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-compatibility.ps1
```

This repeats server/browser/report tests and **44 cases**: eleven operator exercises, seeds 1234/4321, desktop and 390px touch-mobile. It includes loading/grade retries, a lost successful response, refresh, a different authenticated browser owner, native/graph keyboard operations, touch interaction and narrow layout. See [COMPATIBILITY_REGRESSION.md](COMPATIBILITY_REGRESSION.md), [the current status](compatibility/REGRESSION_STATUS.md), and the [offline HTML report](compatibility/report.html).

The recorded run completes all 44 cases: 42 pass and 2 mobile GraphTool touch-positive cases fail grading. Baseline tests pass (79 server, 28 browser, 4 report tests). The gate retains these mobile failures and exits nonzero. Refresh-required scaffold transitions and narrow-frame scrolling are separately visible limitations. A passing subset does not approve the complete matrix or expand the default one-exercise catalog.

## Start

Start Docker Desktop with its Linux engine ready. From the repository root:

```powershell
cd experimental-workspace
docker compose up --build -d --wait --wait-timeout 240
```

The first build downloads the official renderer, its PG submodule, and system, Perl, and JavaScript dependencies. Later builds reuse Docker's cache.

- Exercise picker: http://localhost:3100
- Renderer editor: http://localhost:3101
- Renderer health: http://localhost:3101/health

The renderer is configured for local development. Its editor and raw PG execution API must stay private; this is not a production deployment. The OPL mount is read-only, so editor operations cannot save changes to library files.

## Exercise picker

Open **http://localhost:3100** to use the experimental picker.

- Exercises are grouped by their real catalog topic. Choose **Dot products and vector operations** to start.
- Catalog and exercise loading have separate progress states. Empty catalogs, failed requests, and unavailable saved sessions have clear messages and retry actions.
- Starting an exercise puts its session ID in the page URL. Refresh and browser back/forward restore that same session using the ownership cookie.
- Selecting the current exercise again starts a new version. Buttons are disabled during loading to avoid overlapping starts.
- The layout supports narrow screens, keyboard navigation, accessible answer labels, and reduced-motion preferences.

A prominent **Check answer** button sits beneath the exercise. It collects fresh answer pairs and submits them to the owned session grading endpoint. While checking, the button shows a spinner and **Checking…**, and exercise selection is disabled to prevent overlapping submissions. The button also works with native keyboard activation; on mobile it fills the available width.

Successful checks show **Submitted answers checked and saved.** The live exercise frame stays in place, including any edits made while the request was in flight. Server, network, and answer-collection errors appear beneath the button, leave inputs intact, and re-enable an explicit retry. Requests are not retried automatically. Navigating away cancels the browser request and ignores late results; cancellation does not guarantee that an already-received server request was stopped.

Unsubmitted edits are not saved. Checked answers restore after refresh from the saved renderer session. Each field now shows a result and plain-text PG feedback; an overall result and percentage score appear above Check answer. These results restore after refresh.

The UI lives in `workspace/public/`: `index.html`, `picker.css`, `picker.js`, and `exercise-frame.js`. The server exposes only explicitly listed static files. Catalog text is inserted as text, and API problem HTML is displayed in an iframe with `sandbox="allow-scripts"`, without same-origin access or form submission permissions. A restrictive frame content policy blocks API connections, forms, and unapproved resources; the sandbox blocks top navigation. Self-frame navigation is not comprehensively prevented. Parent messages are checked against the frame window and a per-frame channel.

The backend proxies only JavaScript under the pinned renderer's MathJax directory through `/assets/mathjax/`. Math stays self-hosted, and the frame converts PG's legacy `script[type="math/tex"]` tags before MathJax typesetting. It does not load the renderer editor, outer form controls, or general submit scripts. Reviewed widget dependencies use the separate opaque asset registry; new widgets still need individual compatibility checks.

Browser checks run in a separate Docker image, with no browser packages added to the application:

```powershell
docker build -f browser-tests/Dockerfile -t linear-algebra-picker-qa .
docker run --rm --network linear-algebra-experimental_default --shm-size=1g linear-algebra-picker-qa
```

The browser uses the actual localhost origin, forwarding test HTTP traffic over Docker's service network. The original seven picker checks cover real math rendering and sandbox isolation, mobile layout, refresh/history restoration, loading/empty/error states, and formatting retries. Server checks also cover private asset boundaries and the MathJax proxy.
## Answer collection

The isolated exercise frame captures answer values without giving the parent access to its DOM.

- `workspace/public/answer-fields.js` collects named, enabled input/textarea/select controls within `#problem_body`.
- `workspace/public/answer-bridge.js` provides source/channel-checked, request/reply messaging with the opaque frame.
- `picker.js` associates every snapshot with the current exercise session.

The Check answer handler requests fresh values from the frame:

```javascript
import { collectCurrentAnswers, getCurrentAnswers } from '/assets/picker.js';

const { sessionId, answers } = await collectCurrentAnswers();
// answers.fieldNames: unique eligible field names in DOM order
// answers.entries: ordered [name, value] pairs, including repeated names

const cached = getCurrentAnswers(); // Copy of the last snapshot, or undefined.
```

The frame also reports input/change events. The practice panel emits a bubbling `exercise-answers-change` CustomEvent with `{ sessionId, answers }`, or null when the frame is cleared. These snapshots are in memory only.

Names, whitespace, vector syntax, and empty text values are retained. Radio/checkbox values are included only when checked; multi-selects produce one pair per selected enabled option. Unchecked groups remain in `fieldNames` with no entry, so consumers can distinguish an empty selection from a missing field. Eligible hidden answer fields are included. Disabled/nameless fields, upload/button controls, renderer parameters/tokens, and PG's `MaThQuIlL_`/`previous_` helper fields are excluded. Do not use Object.fromEntries on the pairs: it would discard repeated-name values.

A fresh collection reads the DOM even if a widget changed a value without firing input/change. Replies are matched to unique request IDs; snapshots have monotonic revisions. The parent checks the exact frame window, opaque origin, and channel. The child checks parent window/origin/channel. Replacement destroys the old bridge, clears snapshots, and rejects outstanding requests. Collection failures have `AnswerBridgeError.code` values `NO_FRAME`, `FRAME_REPLACED`, `TIMEOUT`, or `INVALID_RESPONSE`.

Collected data remains untrusted browser input. The grading endpoint verifies ownership and derives permitted fields from restored trusted problem HTML; it never treats the client field manifest as an allowlist. No answers are sent to the renderer or persisted by this collection step. Specialized PG widgets still require individual compatibility checks; file uploads are not supported.

Verified in Chromium with the real four-field OPL exercise, plus native-control fixtures for repeated names, selection semantics, hidden-field filtering, request timeouts, forged messages, and frame replacement. The browser suite now has 23 checks, including submitted-state restoration, native keyboard checking, duplicate protection, server/network error preservation, mobile controls, and navigation during grading.
## Exercise catalog

The server-side allowlist lives in `workspace/server/exercise-catalog.json`. It starts with the verified `dot-product-01` exercise, titled **Dot products and vector operations**, in the **Dot product** topic.

Each entry records its stable ID, friendly metadata, renderer path, OPL source revision and attribution, and verification fixture. The verification seed is for repeatable checks; new exercise sessions create and preserve their own seeds.

Backend code can import the helpers from `workspace/server/exercise-catalog.mjs`:

```javascript
import { getExerciseById, listExercises } from './server/exercise-catalog.mjs';

const choices = listExercises(); // Friendly metadata, without renderer paths.
const exercise = getExerciseById('dot-product-01'); // Full server configuration.
const unknown = getExerciseById('not-in-catalog'); // undefined
```

Use IDs at the client/backend boundary and reject unknown IDs before calling the renderer. Keep both catalog files on the server; do not bundle the JSON into a browser application. The HTTP endpoints use these helpers; the catalog itself does not create sessions.

The renderer smoke check reads its path, seed, and expected field count from this catalog. To add an entry, choose a unique ID, inspect the real OPL file and applicable license, record its source revision, then verify rendering, grading, and restoration with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./smoke-renderer.ps1 -ExerciseId dot-product-01
```
## Renderer client

`workspace/server/renderer-client.mjs` is a Node-only module. It uses the server catalog and Node built-ins; keep it out of browser imports.

```javascript
import { loadExercise } from './server/renderer-client.mjs';

const result = await loadExercise({
  exerciseId: 'dot-product-01',
  seed: 1234,
});
// result: exerciseId, seed, html, sessionToken, problemToken, score, resources
```

The default client reads the server's `RENDERER_URL` (already configured in Compose). For explicit server configuration, use `createRendererClient({ baseUrl: 'http://renderer:3000', timeoutMs: 30000 })` and call its `loadExercise` method. A base URL may include a deployment path prefix; do not include `/render-api` itself, credentials, query parameters, or fragments.

Only exact catalog IDs and integer seeds from 1 through 2147483647 are accepted. The request supplies the approved PG path and fixes student mode, JSON response format, and hidden solutions/correct-answer controls. Arbitrary caller fields cannot override those settings.

The timeout covers connection, response headers, and response-body reading. Requests are not retried or redirected. Responses must contain exercise HTML, session/problem tokens, valid score/flags/resources, and no instructor answer map. The picker uses projected problem content in an isolated frame; this low-level client does not sanitize or display HTML.

Failures are `RendererClientError` instances with a stable `code`:

| Code | Meaning |
|---|---|
| INVALID_CONFIGURATION | Missing/invalid renderer URL or timeout |
| INVALID_INPUT | Missing exercise ID or invalid seed |
| UNKNOWN_EXERCISE | ID is absent from the catalog |
| TIMEOUT | Renderer exceeded the configured deadline |
| NETWORK_ERROR | Connection, interrupted transfer, or redirect failure |
| HTTP_ERROR | Non-success HTTP response; upstream status is in `status` |
| INVALID_RESPONSE | Invalid JSON or unexpected student-response shape |
| PG_ERROR | PG reported an exercise rendering error |

Messages do not include upstream bodies or session tokens. Keep error causes on the server and map failures to friendly messages in future API routes. Keep the returned tokens in the server session layer rather than serializing the entire result to a browser. This module loads, restores, and grades exercises; backend routes use it through the ownership-checking session service.

Run the client tests and live exercise-loading check after rebuilding:

```powershell
docker compose exec -T workspace npm test
docker compose exec -T workspace npm run smoke:renderer-client
```
## Exercise sessions

`workspace/server/exercise-sessions.mjs` manages local persistent sessions:

```javascript
import { createExerciseSessions } from './server/exercise-sessions.mjs';

const sessions = createExerciseSessions();
const started = await sessions.startSession({ exerciseId: 'dot-product-01' });
// started.session: id, exerciseId, seed, createdAt
// started.exercise: html, score, resources

const restored = await sessions.resumeSession(started.session.id);
```

Starting generates a UUID and cryptographically random integer seed in the renderer client's supported range. It renders the approved catalog exercise and saves its exercise ID, seed, renderer session token, renderer problem token, and creation time. A start succeeds only after the record is saved. Callers cannot supply their own seed or session ID.

Resuming reads the record and calls the renderer client's `restoreSession` with the saved renderer token. It does not generate a seed or silently replace a failed/expired session. The renderer token is authoritative for problem state. Records are validated before reuse; missing sessions, invalid IDs, corrupt storage, and removed catalog entries have explicit errors.

Records live at `/data/sessions/<UUID>.json` in Docker volume `linear-algebra-experimental_sessions`, configured through `EXERCISE_SESSION_DIR`. The directory is owned by the non-root Node user with mode 700; files use mode 600. Complete records are published atomically with exclusive creation so concurrent starts do not overwrite each other. Storage is local to this Docker installation and survives restarts, container replacement, rebuilds, and ordinary `docker compose down`.

**Deleting this volume, including with `docker compose down --volumes`, deletes saved sessions.** The external OPL volume is separate and is not removed by that command.

The service returns session metadata and rendered exercise content, without separate token properties. Raw records and error causes must stay server-side. Renderer HTML may contain its own hidden state fields; the frontend still needs controlled rendering rather than exposing raw renderer forms as a public API.

This is a prototype store for starting/resuming exercises. HTTP-created sessions have anonymous browser ownership, enforced before renderer restoration. CLI diagnostics can still create unowned records, which HTTP cannot retrieve. Account ownership, server-side session expiration, and attempt-history storage remain separate work; Supabase can replace the local store at that stage. Successful grading now persists the renderer's updated token atomically.

`ExerciseSessionError.code` is one of `INVALID_CONFIGURATION`, `INVALID_INPUT`, `UNKNOWN_EXERCISE`, `SESSION_NOT_FOUND`, or `STORAGE_ERROR`. Renderer failures retain their `RendererClientError` codes.

Run the live session check:

```powershell
docker compose exec -T workspace npm run smoke:sessions
```

It creates a real session and resumes it through a fresh service instance. Its output contains a session ID but no raw tokens. To resume that same session after restarting/replacing the container:

```powershell
docker compose exec -T workspace npm run smoke:sessions -- <session-id>
```

Verified on 2026-11-14: a live OPL session retained its identity and seed after both container restart and full container recreation. The automated tests additionally cover concurrent starts, private file permissions, invalid/corrupt records, renderer failures, and storage failures.
## Backend API

The experimental server exposes these endpoints at **http://localhost:3100**:

| Method | Path | Behavior |
|---|---|---|
| GET | /api/exercises | List friendly metadata for approved catalog exercises |
| POST | /api/sessions | Start a session from JSON containing only `exerciseId`; returns 201 and a Location header |
| GET | /api/sessions/:id | Restore a session owned by the same browser |
| POST | /api/sessions/:id/answers | Grade validated name/value pairs using the stored renderer token |

Start and retrieve responses have this shape:

```javascript
{
  session: { id, exerciseId, createdAt },
  submission: null, // Latest submitted answers/result after grading.
  exercise: { html, score, resources: { assets } }
}
```

Paths, seeds, raw renderer tokens, source metadata, and renderer settings are not included as API fields. Seeds remain in the private session records. POST rejects extra properties instead of forwarding them. API routes do not accept query parameters. Requests require JSON and are limited to 8 KiB.

Try it from PowerShell:

```powershell
Invoke-RestMethod http://localhost:3100/api/exercises

$started = Invoke-RestMethod http://localhost:3100/api/sessions -Method Post -ContentType application/json -Body '{"exerciseId":"dot-product-01"}' -SessionVariable browser

Invoke-RestMethod "http://localhost:3100/api/sessions/$($started.session.id)" -WebSession $browser
```

A browser on this origin automatically retains the `la_experiment_owner` cookie. The API issues a random bearer identity in a HttpOnly, SameSite=Strict cookie scoped to `/api/sessions`, with a 30-day lifetime. Only its SHA-256 hash is stored in each owned session. Missing/different owners receive the same 404 response as a missing session. Ownership persists across server/container restarts. Deleting or losing the cookie removes browser access to those sessions. Existing unowned CLI diagnostic records cannot be retrieved through HTTP.

This is anonymous browser ownership, not Supabase account login. Keep the sandbox local. Before account-based deployment, associate sessions with authenticated users and apply their access policies.

Cross-origin/cross-site API requests are rejected, and CORS is not enabled. `APP_ORIGIN` is configured as `http://localhost:3100`; change it if the browser uses a different origin. HTTPS configurations add Secure to the owner cookie. Command-line clients without Origin headers can use the API but must retain their cookie when retrieving sessions.

The API parses the verified renderer template and returns only `#problem_body`, preserving answer fields and nested markup. It excludes the outer renderer form, hidden JWTs, submit/instructor controls, and debug output. A changed/missing problem wrapper produces 502 rather than exposing the full renderer page. The HTML parser is pinned in the sandbox package lockfile and installed with npm ci inside Docker. This projection is not a general HTML sanitizer. The picker displays the current trusted PG exercise in a sandboxed frame and loads its math through the constrained backend asset proxy.

Errors use `{ error: { code, message } }` and never return causes, stack traces, or upstream bodies. Invalid input/JSON returns 400, unavailable exercises or sessions 404, unsupported methods 405, oversized bodies 413, unsupported media types 415, renderer failures 502/503/504, and storage failures 500. API responses use Cache-Control: no-store.

Run the endpoint checks after rebuilding:

```powershell
docker compose exec -T workspace npm test
docker compose exec -T workspace npm run smoke:api
```

The HTTP tests use isolated temporary storage and a fake renderer. The live API check creates and restores a real OPL session, checks that renderer tokens are absent from its HTML, and verifies retrieval without the owner cookie is denied. Tests and diagnostics do not log cookies or renderer tokens.

Implementation: `workspace/server/http-app.mjs`, started by `workspace/server.mjs`. The picker now consumes these endpoints. Answer submission is available through the grading endpoint; the practice controls and feedback UI consume it. Account integration remains future work.
## Server-side grading

`POST /api/sessions/:id/answers` grades answers using the same anonymous ownership cookie as session retrieval. Its JSON body contains **only** an `answers` array:

```json
{
  "answers": [
    ["AnSwEr0001", "-16"],
    ["AnSwEr0002", "<-12,48,36>"],
    ["AnSwEr0003", "650"],
    ["AnSwEr0004", "9"]
  ]
}
```

Those example values are illustrative; session seeds vary. For future practice-screen controls, send the fresh collection's ordered pairs:

```javascript
const { sessionId, answers } = await collectCurrentAnswers();
const response = await fetch('/api/sessions/' + encodeURIComponent(sessionId) + '/answers', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ answers: answers.entries }),
});
const result = await response.json();
```

The endpoint returns the usual public session/exercise shape, with PG's actual score in `exercise.score` and re-rendered problem content. It does not accept a score, seed, PG path, token, field manifest, or instructor settings. The visible Check answer button presents the normalized overall and per-field results without replacing live inputs.

The session service verifies ownership before contacting PG. It restores the saved renderer token and derives an answer contract from that trusted problem's controls, using parse5 and the shared answer-name policy. Submitted names must match that contract exactly. Duplicate scalar values are rejected; real repeated controls and multi-select values are preserved. Missing fields are explicitly sent as empty strings so the renderer cannot silently reuse an older JWT answer.

The renderer client's `submitAnswers` sends a form request with the server's token, `submitAnswers=1`, `answersSubmitted=1`, JSON response format, and student settings. User answer strings are not trimmed or mathematically interpreted by the application. PG performs the grading; malformed PG responses and execution errors are reported as service failures.

On success, the updated renderer session/problem tokens, updatedAt timestamp, and latest submission snapshot replace the private JSON record atomically. Exercise identity, seed, and ownership remain unchanged. Subsequent submissions and restoration use the new token. Only the latest accepted submission is retained; a full attempt-history store is separate work.

Overlapping submissions for a session return **409 SESSION_BUSY**. The guard is shared across service instances within the one local Node process and released on success or failure. Multiple backend processes/replicas need database transactions or a distributed lock before scaling this file-based prototype. No automatic retry is performed. Renderer or storage failures do not overwrite the previously saved record or produce a success response.

The existing same-origin rules, 8 KiB JSON limit, private token handling, and friendly error responses apply. Invalid answer data returns 400; missing or different owners receive 404; timeouts/unavailable renderer responses retain the existing 502/503/504 mappings.

Run the operator-only live grading diagnostic:

```powershell
docker compose exec -T workspace npm run smoke:grading
```

It obtains expected answers directly from the renderer in instructor mode solely for testing; instructor responses never pass through the student API and are not logged. Verified against the installed PG engine: incorrect score 0, partial score 0.25, correct score 1, restored correct score 1, and cleared-answer score 0. The current regression suite passes 68 server tests and 23 browser checks.

Implementation: `renderer-client.mjs`, `answer-contract.mjs`, `exercise-sessions.mjs`, and `http-app.mjs` in `workspace/server/`.
## Saved submission state

Each successful grading response now writes the latest submission in the **same atomic JSON replacement** as the new renderer tokens:

```javascript
{
  submissionCount,
  lastSubmission: {
    id, number, submittedAt,
    fieldNames,
    answers,
    score,
    feedback: { message, summary },
    fieldFeedback: [{ name, status, score, message }]
  }
}
```

`answers` preserves the exact validated request pairs, including whitespace, empty values, and duplicate names. `fieldNames` comes from the restored trusted PG problem, so omitted selections can be distinguished from unknown fields. PG still receives explicit blanks for omitted answers. The timestamp and submission ID are generated by the server; the score and feedback come from PG.

Feedback stores the student-facing PG message and result summary as plain text. HTML formatting is removed, block spacing/entities are normalized, and executable script/style contents are discarded. The practice screen displays these strings as text. `fieldFeedback` adds a separate safe per-field result, also rendered as text.

The private file keeps a count of successfully saved submissions and **only the latest snapshot**, rather than an attempt-history log. The snapshot ID stays stable across retrieval and changes on the next accepted submission. Failed grading or failed saving leaves the preceding snapshot and token unchanged.

Start, grading, and retrieval API responses now include `submission`: null before the first recorded submission, otherwise the public snapshot above. Tokens and ownership hashes remain private. The last checked score/feedback come from this saved snapshot, while the renderer token reconstructs the original question and entered answer values. Restoring does not increment the submission count or call the grading endpoint.

Older version-1 files containing only renderer tokens remain valid. Their explicit submission snapshot starts with the next successful grade; existing PG state is not reset or guessed. Corrupt or inconsistent count/snapshot metadata is rejected as a storage error.

All state remains in the existing private Docker session volume, with the same file permissions, ownership checks, and single-process submission guard. Deleting that volume still deletes the sessions and their latest submissions. Unsubmitted edits remain in browser memory only; the visible controls and feedback use the saved snapshot; editing an answer marks its old feedback as stale.

Run the focused live state check:

```powershell
docker compose exec -T workspace npm run smoke:submission-state
```

Verified on 2026-11-14: exact answers (including spaces and vector syntax), submission identity/count/time, score, and feedback survive browser refresh and full container replacement. Refresh makes no additional grading request. The full suite passes 68 server tests and 23 browser checks.
## Student grading feedback

The practice screen shows feedback directly beneath each answer field and an overall result with a percentage score. Status labels distinguish **Correct**, **Incorrect**, **Partially correct**, **Invalid input**, **Not answered**, and **Not graded**. A failed HTTP request remains a service error rather than a mathematical result.

`workspace/server/grading-feedback.mjs` reads only the private `JWT.answer` returned directly by the configured renderer, whose PG results are at `score.answers`. It projects only `{name, status, score, message}` for submitted trusted field names. The token, correct answers, previews, debug information, and other claims are never returned to students or saved in the public snapshot. No instructor-mode request is used for student feedback. This decoding treats the token as trusted upstream response data; it does not authenticate browser-supplied JWTs.

PG MathObjects can put both parse errors and mathematical hints into `error_message`. Classify invalid input from an explicit PG error flag, or a reported error with an explicitly missing parsed `student_value`. A parsed vector with incorrect coordinates remains **Incorrect**, with the coordinate hints displayed. Do not infer validity from message wording. Ordinary mathematical expressions of the wrong type can still be parsed; their PG message explains the mismatch.

The API snapshot includes optional `fieldFeedback` entries with `status` in `correct`, `incorrect`, `partial`, `invalid`, `unanswered`, or `ungraded`; score is a fraction or null when no individual result is available. PG settings that suppress individual grades are respected. Older snapshots without this array still restore; checking again obtains individual feedback.

`workspace/public/field-feedback.js` inserts only text into the opaque iframe through source/origin/channel-checked bridge messages. Each visible field links to its message with `aria-describedby`; invalid input uses `aria-invalid`. Editing a field changes its message to **Changed since last check**, removes the old invalid marker, and marks the overall result as describing the last submission. The live inputs remain intact, including edits made while grading was in flight. PG popover controls are removed from the isolated view because the custom messages replace them.

The real Chromium exercise flow covers mixed invalid/wrong/blank/correct fields, coordinate hints, partial credit, all-correct and all-incorrect results, edits, and restoration without another grading request. Unsupported PG widgets and custom evaluators still need separate verification before catalog expansion.

## Accessibility and responsive practice

The complete practice flow supports keyboard navigation:

- The first Tab reveals **Skip to exercise**. Starting or restoring an exercise focuses its heading when the student has not moved elsewhere; Tab then reaches the exercise content and answer fields.
- **Enter** in an enabled ordinary single-line answer collects fresh values and submits once. Textareas keep newlines; native select/radio/checkbox controls keep their keys. Modified/repeated Enter, IME composition, key code 229, datalists, comboboxes, grids, and fields marked `data-enter-submit="off"` do not trigger this shortcut. Input fields advertise `aria-keyshortcuts` and a mobile Enter hint where applicable.
- After a check, focus moves to the overall result. **Return to answers** focuses the first invalid, unanswered, or incorrect field, with its feedback available through `aria-describedby`. A failed request returns focus to **Check answer**, with a visible error and retry available.
- Focus movement is conditional: typing, moving focus, pointing, or scrolling while a request is pending keeps the student's current position. Late math-formatting messages do not repeatedly reset focus.

A dedicated polite live region outside the busy practice panel announces loading, checking, results, restoration, and the transition to unsubmitted edits. The overall result is a named region; continued typing does not rebuild or re-announce its whole result. Service failures use an alert. Hidden stale-result text is excluded from the focused result's accessible description until it applies.

Mathematics retains self-hosted MathJax assistive MathML. Expressions that overflow can receive keyboard focus for local horizontal scrolling. The opaque iframe retains its title, labels, sandbox, content policy, and authenticated source/origin/channel messages; the parent never reads the frame DOM.

The layout is verified at 320 pixels and with 200% CSS zoom. Answer text is at least 16px, ordinary answer controls and primary/mobile action buttons are at least 48px high, secondary actions are at least 44px, and native choice labels have comfortable targets. Focus indicators remain visible across the frame boundary and in forced colors. Muted text contrast is stronger and reduced-motion preferences remain supported.

Automated Chromium checks cover keyboard-only selection/check/review, native and IME exceptions, forged shortcut messages, focus preservation, errors, assistive mathematics, conditional descriptions, nonrepeating announcements, contrast, forced colors, and mobile/reflow dimensions. **An actual NVDA/VoiceOver listening session has not been run.** Before public release, manually check reading order, spoken mathematical expressions, checking/error announcements, and focus recovery with a screen reader on the target browser/device.

## Complete experience verification

The real four-field `dot-product-01` exercise is verified from selection through grading and restoration. Coverage includes vector notation and whitespace, partial credit, explicit retries, a lost response after saving, refresh/history, browser ownership isolation, keyboard/mobile use, and an actual abrupt renderer outage. See [PRACTICE_VERIFICATION.md](PRACTICE_VERIFICATION.md) for results and scope.

Run the complete acceptance checks from this directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./verify-practice.ps1 -IncludeRendererOutage
```

The outage option briefly interrupts only the experimental renderer and restores it in `finally`; no volumes are removed. Omit it for ordinary checks, or use `-RendererOutageOnly` for focused recovery verification. An explicit retry after an ambiguous lost response is a new submission; refreshing restores the last accepted result without grading again.

The outage check found and fixed stale Hypnotoad PID-file handling. Compose now removes only `/usr/app/script/hypnotoad.pid` before starting the renderer with `exec`, preventing PID reuse from triggering a false hot reload after a stop or crash. Keep this startup wrapper when updating the pinned renderer.

## Render a real exercise

The following path was verified in the cloned library:

```text
Library/FortLewis/Calc3/13-3-Dot-product/HGM4-13-3-04-The-dot-product.pg
```

In the renderer editor, enter that path and seed `1234`, load the source, and render it. The problem has four fields involving dot products and vectors.

To request HTML and state as JSON:

```powershell
$problem = Invoke-RestMethod -Uri http://localhost:3101/render-api -Method Post -Body @{
    sourceFilePath = 'Library/FortLewis/Calc3/13-3-Dot-product/HGM4-13-3-04-The-dot-product.pg'
    problemSeed = '1234'
    _format = 'json'
    isInstructor = '0'
}
$problem.renderedHTML
```

The response includes `renderedHTML`, `problem_result`, `problem_state`, `flags`, `resources`, and `JWT`. Save `JWT.session` and send it back as `sessionJWT` to preserve the exercise instance and attempts. Answers are form fields using the names generated by PG, with `submitAnswers=1` and `answersSubmitted=1`. JSON response format does not mean the request body is JSON: this renderer reads form parameters.

Run the integration check from this directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./smoke-renderer.ps1
```

The execution-policy override applies only to this PowerShell process. Verified on 2026-11-14: four fields rendered with seed 1234, incorrect answers scored 0, correct answers scored 1, and session restoration retained score 1. The diagnostic submits raw `correct_value` fields; vector `correct_ans` display strings are HTML-escaped and unsuitable for direct submission.

This local diagnostic uses instructor mode only to obtain expected answers for checking the grader. It verifies student responses omit the instructor answer map. Do not expose instructor responses or forward arbitrary renderer parameters through a student-facing API.

The starter container can reach the renderer at `http://renderer:3000`, available as `RENDERER_URL`. The renderer client and session service use that environment variable; the backend API now loads and restores exercises, and the picker displays them on the home page. The main Next.js application has not been connected.

## Pinned upstream sources

- Renderer: https://github.com/openwebwork/renderer at `1134ffbbf5e656148e579f424f70bcd9f1d15936`.
- PG submodule: `4b3e564cf4e5a36807ca5a341734f8d604e8b77d`, fetched recursively by Docker's Git build context.
- Open Problem Library: https://github.com/openwebwork/webwork-open-problem-library.git at `0d42812d6d02960c846fc0f89215e0d4f1e761b1` when cloned.

The renderer uses the upstream Dockerfile. The source revision is pinned, but dependency repositories may change between fresh builds. Upstream's image currently uses Ubuntu 20.04 and Node.js 16; the upstream npm installs also reported 9 vulnerabilities (2 moderate, 7 high) in each asset package tree. Updating dependencies and hardening the configuration are separate work before production.

Official setup and API documentation: https://github.com/openwebwork/renderer#readme

## Open Problem Library volume

The complete library lives in external Docker volume `linear-algebra-experimental_opl`, under `webwork-open-problem-library/`. Compose mounts that volume subdirectory read-only at `/usr/app/webwork-open-problem-library` inside the renderer.

The volume must already exist and contain the clone. On a fresh Docker installation, create it with:

```powershell
docker run --rm --mount type=volume,source=linear-algebra-experimental_opl,target=/library alpine:3.23 sh -c 'apk add --no-cache git && git clone https://github.com/openwebwork/webwork-open-problem-library.git /library/webwork-open-problem-library && git -C /library/webwork-open-problem-library checkout 0d42812d6d02960c846fc0f89215e0d4f1e761b1'
```

Run that clone command only for a new, empty volume. Inspect the current library with:

```powershell
docker compose exec renderer ls /usr/app/webwork-open-problem-library
```

Google Drive checkout failed due to path and directory limitations; the incomplete local copy can be deleted safely. The directory is excluded from application Git tracking and Docker builds. No library files need to sync through Google Drive.

The external volume persists after `docker compose down --volumes`. Do not delete it using Docker Desktop's volume cleanup unless you intend to reclone the library. Check `OPL_LICENSE` and individual problem licenses before redistributing exercises.

## Develop and troubleshoot

Source for the starter is copied into its image because Google Drive bind mounts appeared empty. Edit `workspace/` on the host, then rebuild to apply changes:

```powershell
docker compose up --build -d --wait
docker compose ps
docker compose logs --tail 100 renderer
docker compose exec workspace sh
docker compose down
```

Both services belong to Compose project `linear-algebra-experimental`, on a dedicated network with localhost-only ports. No host source directories or application secrets are mounted. If Docker reports a missing engine pipe, start Docker Desktop and wait for its Linux engine to become ready.
