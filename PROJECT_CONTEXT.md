# Project context and session handoff

Updated 2026-11-14. Start with this handoff, [AGENTS.md](AGENTS.md), and the detailed [experimental workspace README](experimental-workspace/README.md). Product direction is in [Project_goals.md](Project_goals.md).

## Where development stands

The active work is the independent **experimental-workspace/** WeBWorK integration. The existing root Next.js/Supabase application remains separate. Its earlier context is retained below; do not confuse its grading, tests, or authentication with the sandbox.

The goal is a polished student practice experience using OPL problems and PG mathematical grading. Build one complete, reliable exercise flow before importing large numbers of exercises.

This handoff accompanies the commit adding server-side grading, saved submission state, tests, and updated documentation on `main`. Its preceding implementation baseline is `4b6248d` (`Collect PG answers through an isolated frame bridge`). Run `git log -1` and `git status --short` to confirm the current revision and any newer local work before continuing. These backend features are already implemented; do not rebuild them from scratch.

## Implemented in the sandbox

1. Official pinned standalone renderer and PG submodule, built in Docker. OPL is cloned into an external Linux volume, outside Google Drive.
2. Verified server catalog: **dot-product-01**, title **Dot products and vector operations**, topic **Dot product**, four answer fields. Path: `Library/FortLewis/Calc3/13-3-Dot-product/HGM4-13-3-04-The-dot-product.pg`. Fixture seed 1234 is for verification; actual sessions generate their own seed.
3. Server-only renderer client: form requests, validation, timeout/error handling, loading, restoration, and grading. Renderer settings remain under server control.
4. Persistent exercise sessions: UUID, stable random seed, private renderer tokens, anonymous browser ownership, atomic JSON storage on a Docker volume.
5. Friendly topic/exercise picker with loading/empty/error states, responsive layout, real MathJax mathematics, and URL/history session restoration.
6. Answer collection across an isolated iframe, preserving generated names, whitespace, and ordered duplicate pairs. Fresh collection works even without a widget firing input/change.
7. Ownership-checked grading endpoint, trusted server-derived answer contract, missing-answer clearing, and per-session overlap protection.
8. Atomic persistence of updated renderer tokens plus the latest successful submission snapshot: ID, number, server timestamp, allowed field names, exact submitted pairs, PG score, and plain-text PG feedback. Legacy token-only records still restore. Only the latest snapshot is retained.

**UI boundary:** Students can select and view exercises and edit answers. There is still no visible **Check answer** button or result/feedback panel. Grading and persistence are available through the backend and diagnostics. Submitted values restore from PG tokens; unsubmitted edits are not autosaved. This does not yet implement account-based progress or submission history.

## Start or resume locally

Windows PowerShell, repository on Google Drive. Start Docker Desktop and wait for its Linux engine to be ready. A missing `dockerDesktopLinuxEngine` named pipe means the Docker daemon is unavailable.

From the repository root:

```powershell
cd experimental-workspace
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 240
docker compose ps
```

- Practice UI: http://localhost:3100 (use this exact configured origin).
- Private renderer editor: http://localhost:3101; health: `/health`.
- Original Next.js app: http://localhost:3000, started separately with root npm scripts.
- Sandbox source is copied into the image because Google Drive bind mounts appeared empty. Rebuild after edits. For workspace-only changes: `docker compose up --build -d --wait --wait-timeout 120 workspace`.
- Logs: `docker compose logs --tail 100 workspace renderer`.
- Stop while retaining data: `docker compose down`. `docker compose down --volumes` deletes saved sessions.

The external `linear-algebra-experimental_opl` volume contains the `webwork-open-problem-library` subdirectory, mounted read-only into the renderer. It persists through Compose volume removal because it is external. A fresh machine needs the [OPL volume initialization](experimental-workspace/README.md#open-problem-library-volume) before Compose startup. Never clone the full library to Google Drive; its roughly 88,000 tracked files include assets and macros, not just exercises.

Session JSON is private under `/data/sessions` in `linear-algebra-experimental_sessions`. Do not commit, expose, or casually delete it. An ownership cookie is required to retrieve HTTP-created sessions; knowing their UUID alone grants no access.

Pinned upstream revisions are documented in the workspace README: renderer `1134ffbbf5e656148e579f424f70bcd9f1d15936`, OPL `0d42812d6d02960c846fc0f89215e0d4f1e761b1`.

## Code map and API contract

All paths below are relative to `experimental-workspace/`:

| Area | Files |
| --- | --- |
| Containers and mounts | `compose.yaml`, `Dockerfile` |
| Catalog and friendly metadata | `workspace/server/exercise-catalog.json`, `exercise-catalog.mjs` |
| PG requests and normalized responses | `workspace/server/renderer-client.mjs` |
| Ownership, tokens, persistence, grading | `workspace/server/exercise-sessions.mjs` |
| Trusted answer fields and validation | `workspace/server/answer-contract.mjs` |
| Saved submission schema/legacy compatibility | `workspace/server/submission-state.mjs` |
| API, student HTML projection, static assets | `workspace/server/http-app.mjs` |
| Picker and next UI work | `workspace/public/index.html`, `picker.css`, `picker.js` |
| Isolated PG content and messages | `workspace/public/exercise-frame.js`, `answer-fields.js`, `answer-bridge.js` |
| Browser integration tests | `browser-tests/picker.test.mjs` |

Endpoints:

- `GET /api/exercises`: friendly catalog entries, without source paths.
- `POST /api/sessions`: JSON `{ "exerciseId": "dot-product-01" }`.
- `GET /api/sessions/:id`: restore the owned session.
- `POST /api/sessions/:id/answers`: JSON `{ "answers": [["AnSwEr0001", "2 + 3"]] }`, using the actual collected field names. No client seed, path, token, settings, or field manifest.

Session responses contain `session: {id, exerciseId, createdAt}`, `exercise: {html, score, resources}`, and `submission: null` or `{id, number, submittedAt, fieldNames, answers, score, feedback: {message, summary}}`. Tokens and seeds remain private. Score is a fraction from 0 to 1.

In `picker.js`, `collectCurrentAnswers()` returns `{sessionId, answers: {fieldNames, entries}}`; submit `answers.entries` as the API's `answers`. Do not convert pairs into an object, which would lose repeated names. Snapshots are browser input; only restored server-trusted HTML defines allowed fields.

Ownership uses `la_experiment_owner`, an HttpOnly/SameSite=Strict cookie, with only its hash stored. Requests are same-origin with strict JSON validation and an 8 KiB body limit. Wrong-owner/unknown sessions return 404; overlapping grades return 409 `SESSION_BUSY`. Current concurrency protection assumes one Node process. Renderer failures leave the old saved state intact; do not automatically retry grading.

## Verification recorded before this documentation update

The implementation work passed **60 server tests and 12 Chromium browser checks**, plus renderer-client, sessions, API, grading, and submission-state smoke checks and the PowerShell renderer check. Live grading covered wrong/partial/correct results (0, 0.25, 1) and clearing previously saved answers.

A real forced workspace-container replacement also preserved the same owned session, latest submission metadata, score/feedback, and exact regenerated answer values, including whitespace and empty strings. These are historical results from the implementation work; rerun relevant checks after code changes.

Run from `experimental-workspace/` after rebuilding:

```powershell
docker compose exec -T workspace npm test
docker compose exec -T workspace npm run smoke:renderer-client
docker compose exec -T workspace npm run smoke:sessions
docker compose exec -T workspace npm run smoke:api
docker compose exec -T workspace npm run smoke:grading
docker compose exec -T workspace npm run smoke:submission-state
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./smoke-renderer.ps1
docker build -f browser-tests/Dockerfile -t linear-algebra-picker-qa .
docker run --rm --network linear-algebra-experimental_default --shm-size=1g linear-algebra-picker-qa
```

The separate browser image keeps Playwright out of app dependencies. It forwards the actual localhost origin through the Docker network; preserve this setup for cookie/origin/secure-context behavior. Instructor answer maps are allowed only in operator diagnostics; never return or log them through student APIs.

## Next task: connect grading to the practice UI

1. Add a prominent accessible **Check answer** button. Collect fresh frame values, confirm they belong to the current session, and POST ordered pairs to the grading endpoint.
2. Show a checking state and prevent duplicate submissions. Preserve inputs on errors, offer useful recovery, and avoid attaching an old response to a newly selected session. Do not silently retry a grade.
3. Use the returned exercise content and submission snapshot to show the latest score and overall feedback. Restore that result after refresh without submitting again. Preserve frame isolation and answer bridge cleanup when replacing content.
4. Support keyboard submission, focus management, screen-reader status, and mobile layout. Verify behavior for Enter/IME and multiline fields rather than intercepting all Enter presses.
5. Add browser coverage for the real student flow: edit, check, result, retry after an error, refresh, and switch exercise during a request.

Current feedback is an overall PG plain-text message/summary. Per-field feedback needs a deliberate student-safe response contract after inspecting real PG responses; do not expose the instructor answer map.

After this one-exercise flow is polished, verify more OPL entries and specialized widgets individually. Do not publish all 81k exercises in bulk: indexing, topic relevance, renderer compatibility, source attribution, and licenses still need review. Later integrate Supabase account ownership/progress and durable attempts, plus concurrency suitable for multiple server processes.

## Remaining limits

The renderer/editor supports raw PG execution and uses an older upstream dependency stack with reported npm vulnerabilities. This is a localhost development environment, not a production deployment. Hardening and dependency review are required before public hosting. The current HTML projection is not a general-purpose sanitizer; preserve the iframe sandbox and content policy. Graphs, special widgets, and file uploads are not generally supported by the current verified flow.

## Suggested prompt for a fresh session

```text
Read AGENTS.md, PROJECT_CONTEXT.md, experimental-workspace/AGENTS.md, and
experimental-workspace/README.md. Inspect git status and preserve any local
changes. Grading and submission-state persistence already exist. Continue in the Docker sandbox:
connect a prominent Check answer button to the existing answer collector and
POST /api/sessions/:id/answers, then display and restore student-safe feedback.
Keep the original Next.js/Supabase application separate.
```

---

# Original Next.js/Supabase application reference

The sections below describe the original application, not the Docker PG sandbox.

## Purpose

This is an open source linear algebra practice platform aligned with the Khan Academy linear algebra track. The app organizes content as:

`Units -> Themes -> Subthemes -> Exercises`

Students can browse practice themes, solve exercises, and save attempts through Supabase auth. Admin users can manage course structure and author exercises.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase Postgres/Auth/RLS
- `@supabase/ssr` for server/browser clients
- `react-hook-form` and `zod` for admin form validation
- `react-markdown`, `remark-math`, `rehype-katex`, and `katex` for markdown/LaTeX rendering

## How To Run

From the repo root:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Required environment variables in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Verification Commands

```bash
npm run lint
npm run smoke:admin
npm run build
```

Known build caveat: production build uses `next/font/google` for Geist fonts. In restricted-network environments, `npm run build` can fail while fetching Google Fonts even when the app code is otherwise valid.

## Important Files

- `src/app/page.tsx`: landing/status page and course overview.
- `src/app/layout.tsx`: root layout, header navigation, admin link visibility.
- `src/app/login/page.tsx`: Supabase email/password login and signup.
- `src/app/profile/page.tsx`: user stats, attempts, logout.
- `src/app/practice/page.tsx`: unit/theme listing with progress.
- `src/app/practice/[topic]/page.tsx`: selected theme/subtheme practice page.
- `src/app/practice/[topic]/exercise-attempt-card.tsx`: main solving UI and client-side grading.
- `src/components/content/markdown-content.tsx`: markdown + LaTeX rendering.
- `src/app/admin/exercises/page.tsx`: admin exercise page.
- `src/app/admin/exercises/actions.ts`: server actions for exercise create/update/autosave/publish/delete.
- `src/components/admin/exercise-editor.tsx`: exercise authoring UI.
- `src/app/admin/structure/page.tsx`: admin structure page.
- `src/app/admin/structure/actions.ts`: server actions for units/themes/subthemes.
- `src/components/admin/structure-manager.tsx`: structure management UI.
- `src/components/admin/vector-plane.tsx`: graph display for a single vector.
- `src/components/admin/multi-vector-plane.tsx`: multi-vector graph display and interactive plotting.
- `lib/supabase/server.ts`: canonical server Supabase client.
- `lib/supabase/client.ts`: canonical browser Supabase client.
- `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts`: re-exports for `@/lib/...` imports.
- `src/types/database.ts`: Supabase database typings.
- `supabase/schema.sql`: initial dev schema.
- `supabase/migrations/`: later database changes for admin UI/RLS/status handling.
- `supabase/seed.sql`: starter course/content data.
- `DATABASE_SETUP.md`: detailed Supabase setup, admin promotion, RLS, and verification notes.
- `scripts/smoke-admin.sh`: admin smoke check.

## Implemented Features

- Course browsing by units, themes, and subthemes.
- Published exercise listing per subtheme.
- Per-theme and per-subtheme progress based on correct attempts.
- Supabase auth login/signup.
- Profile page with total attempts, correct attempts, accuracy, streak, and recent attempts.
- Attempt saving for logged-in users.
- Admin-only course structure management:
  - units
  - themes
  - subthemes
- Admin-only exercise management:
  - draft and published statuses
  - autosave draft
  - create/update/delete
  - publish
  - markdown/LaTeX prompt preview
- Exercise formats supported by the main attempt card:
  - plain text/JSON answer comparison
  - vector coordinate reading from graph
  - point/vector plotting on an interactive plane
  - single choice
  - multi-select
  - equal-vector picking
  - multi-part exercises mixing several supported part types

## Database Notes

Detailed setup is documented in `DATABASE_SETUP.md`.

The initial schema is in `supabase/schema.sql`, but it is not the complete current database shape by itself. Apply migrations from `supabase/migrations/` after the base schema.

Recommended fresh setup order:

1. Run `supabase/schema.sql`.
2. Run `supabase/migrations/20260221_admin_exercise_panel.sql`.
3. Run `supabase/migrations/20260221_admin_structure_rls.sql`.
4. Run `supabase/migrations/20260221_remove_archived_status.sql`.
5. Run `supabase/seed.sql`.
6. Create/sign in a user.
7. Set that user as admin manually:

```sql
update public.profiles
set role = 'admin'
where id = '<auth-user-id>';
```

Important: `seed.sql` inserts starter exercises without an explicit `status`. After the admin migration, exercises default to `draft`, while practice pages only show `status = 'published'`. Publish seeded exercises or update the seed if starter exercises should appear immediately.

## Auth And Admin Rules

- Admin access is determined by `profiles.role = 'admin'`.
- Admin pages redirect unauthenticated users to `/login`.
- Non-admin users see an admin access required message.
- RLS policies allow public read access for course structure and exercises.
- Writes to units/themes/subthemes/exercises are admin-only.
- Attempts and profiles are user-owned.

## Exercise Data Model

Admin editing stores both author-facing and runtime fields:

- `prompt_md`: markdown source shown in editor.
- `solution_md`: markdown/text solution source shown in editor.
- `choices`, `hints`, `tags`: metadata/config JSON.
- `prompt`: normalized runtime JSON used by practice UI.
- `solution`: normalized runtime JSON used by grading.
- `status`: `draft` or `published`.

The conversion from editor input to runtime JSON happens in `src/app/admin/exercises/actions.ts`.

## Current Known Issues / Gaps

- `PracticeRunner` exists at `src/app/practice/[topic]/practice-runner.tsx` but appears superseded by `ExerciseAttemptCard`.
- Production build may fail in restricted-network environments because `next/font/google` fetches Google Fonts.
- Seeded exercises may be hidden because they default to `draft`.
- Original-app grading is mostly client-side and exact-match based. Server-side PG grading exists only in the separate sandbox.
- Some exercise formats rely on JSON config in the admin editor, so authoring UX may still need polish.
- The original Next.js app has lint/admin smoke checks; the separate PG sandbox has its own server and browser suites.
