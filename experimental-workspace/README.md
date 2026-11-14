# Experimental Docker workspace

Independent sandbox for the official WeBWorK standalone renderer and PG integration. The existing Next.js application and Supabase configuration are separate.

## Start

Start Docker Desktop with its Linux engine ready. From the repository root:

```powershell
cd experimental-workspace
docker compose up --build -d --wait --wait-timeout 240
```

The first build downloads the official renderer, its PG submodule, and system, Perl, and JavaScript dependencies. Later builds reuse Docker's cache.

- Sandbox starter: http://localhost:3100
- Renderer editor: http://localhost:3101
- Renderer health: http://localhost:3101/health

The renderer is configured for local development. Its editor and raw PG execution API must stay private; this is not a production deployment. The OPL mount is read-only, so editor operations cannot save changes to library files.

## Exercise catalog

The server-side allowlist lives in `workspace/server/exercise-catalog.json`. It starts with the verified `dot-product-01` exercise, titled **Dot products and vector operations**, in the **Dot product** topic.

Each entry records its stable ID, friendly metadata, renderer path, OPL source revision and attribution, and verification fixture. The verification seed is for repeatable checks; future exercise sessions should create and preserve their own seeds.

Backend code can import the helpers from `workspace/server/exercise-catalog.mjs`:

```javascript
import { getExerciseById, listExercises } from './server/exercise-catalog.mjs';

const choices = listExercises(); // Friendly metadata, without renderer paths.
const exercise = getExerciseById('dot-product-01'); // Full server configuration.
const unknown = getExerciseById('not-in-catalog'); // undefined
```

Use IDs at the client/backend boundary and reject unknown IDs before calling the renderer. Keep both catalog files on the server; do not bundle the JSON into a browser application. The helpers do not add HTTP endpoints or exercise sessions.

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

The timeout covers connection, response headers, and response-body reading. Requests are not retried or redirected. Responses must contain exercise HTML, session/problem tokens, valid score/flags/resources, and no instructor answer map. The returned HTML and resources still need an appropriate rendering strategy in the future frontend; the client does not sanitize or display them.

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

Messages do not include upstream bodies or session tokens. Keep error causes on the server and map failures to friendly messages in future API routes. Keep the returned tokens in the server session layer rather than serializing the entire result to a browser. This module implements exercise loading; session storage is provided by exercise-sessions.mjs; answer-submission methods and backend endpoints are separate steps.

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

This is a prototype store for starting/resuming exercises. It does not yet assign user ownership, expire sessions, save graded-attempt updates, or expose HTTP endpoints. Before adding a multi-user API, attach sessions to authenticated users and enforce ownership; Supabase can replace the local store at that stage. Future grading must persist the renderer's updated token after each accepted submission.

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

The starter container can reach the renderer at `http://renderer:3000`, available as `RENDERER_URL`. The renderer client and session service use that environment variable; the starter page does not yet proxy exercises. The main Next.js application has not been connected.

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
