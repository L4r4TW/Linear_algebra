# Project context and session handoff

Updated 2026-11-14. Start with this handoff, [AGENTS.md](AGENTS.md), and the detailed [experimental workspace README](experimental-workspace/README.md). Product direction is in [Project_goals.md](Project_goals.md).

## Where development stands

The active work is the independent **experimental-workspace/** WeBWorK integration. The existing root Next.js/Supabase application remains separate. Its earlier context is retained below; do not confuse its grading, tests, or authentication with the sandbox.

The goal has expanded to a multi-subject practice platform covering the whole OPL, using PG mathematical grading. Design the future catalog for all subjects, while validating playable exercises in batches. Build one complete, reliable exercise flow before broadly enabling large numbers of exercises.

This handoff accompanies the renderer compatibility study commit on `main`. Its preceding pushed baseline is `d3d1b1e5f7e3f4e361d6079980332d1ad7a658e3` (complete-flow verification and renderer restart fix). Run `git log -1` and `git status --short` before continuing, and preserve newer local work.

## Implemented in the sandbox

1. Official pinned standalone renderer and PG submodule, built in Docker. OPL is cloned into an external Linux volume, outside Google Drive.
2. Verified server catalog: **dot-product-01**, title **Dot products and vector operations**, topic **Dot product**, four answer fields. Path: `Library/FortLewis/Calc3/13-3-Dot-product/HGM4-13-3-04-The-dot-product.pg`. Fixture seed 1234 is for verification; actual sessions generate their own seed.
3. Server-only renderer client: form requests, validation, timeout/error handling, loading, restoration, and grading. Renderer settings remain under server control.
4. Persistent exercise sessions: UUID, stable random seed, private renderer tokens, anonymous browser ownership, atomic JSON storage on a Docker volume.
5. Friendly topic/exercise picker with loading/empty/error states, responsive layout, real MathJax mathematics, and URL/history session restoration.
6. Answer collection across an isolated iframe, preserving generated names, whitespace, and ordered duplicate pairs. Fresh collection works even without a widget firing input/change.
7. Ownership-checked grading endpoint, trusted server-derived answer contract, missing-answer clearing, and per-session overlap protection.
8. Atomic persistence of updated renderer tokens plus the latest successful submission snapshot: ID, number, server timestamp, allowed field names, exact submitted pairs, PG score, and plain-text PG feedback. Legacy token-only records still restore. Only the latest snapshot is retained.
9. Practice controls: a prominent Check answer button beneath the frame submits fresh answer pairs, shows Checking… with a spinner, disables repeat submissions and exercise starts, and reports success or an inline error. The frame remains intact on success/failure, preserving edits made during the request. Browser history navigation cancels pending browser work and ignores late responses. No automatic grading retries.

10. Student feedback: per-field PG messages, separate invalid-input/mathematical-error states, overall result and percentage score, saved-result restoration, and changed-since-check markers without replacing inputs.

11. Accessibility/layout: Enter submits eligible single-line fields while preserving native widget/IME keys; conditional focus follows loading, results, and failures; Return to answers focuses the first field needing attention. A dedicated polite live region announces state changes without repeating the result while typing. Visible focus, stronger contrast, assistive MathML, 320px layout, forced colors, reduced motion, 16px answer text, and touch targets have browser coverage.

12. Complete-experience verification: 68 server tests, 23 browser checks, all focused live smoke checks, and actual renderer crash/recovery. New browser tests verify ownership across independent contexts and recovery of an accepted submission whose response was lost. See [PRACTICE_VERIFICATION.md](experimental-workspace/PRACTICE_VERIFICATION.md).

**UI boundary:** Students can now select, edit, check answers, and read field/overall results. Checked values restore from PG tokens; unsubmitted edits are not autosaved. Inputs remain editable during checking, so later edits are not necessarily included in that submission. No account-based progress or attempt history yet.

## Renderer compatibility study

Read [INTEGRATION_CONTRACT.md](experimental-workspace/INTEGRATION_CONTRACT.md), [COMPATIBILITY_MATRIX.md](experimental-workspace/COMPATIBILITY_MATRIX.md), and [compatibility/README.md](experimental-workspace/compatibility/README.md). The separate operator catalog contains eleven real files with stable IDs, attribution, source hashes/revisions, required capabilities, and seeds 1234/4321. All eleven generated at both seeds; sampled browser answers at 1234 and blank answers at 4321 were graded and restored. Eleven paired Chromium comparisons at seed 1234 used the full official reference and the actual app projection/frame/bridge/answer contract.

Seven native-answer paths include the existing dot-product baseline plus six candidates. Static GIF delivery, generated graph images, GraphTool dependencies/state, and scaffold behavior are blocked. A positive scaffold diagnostic confirmed two fields becoming four after a correct first part (score 0.5), retained on restoration. The current picker does not apply changed problem HTML after grading, so dependency loading alone cannot support staged problems.

The only runtime code change exports the existing `problemHtml` function for reuse by operator QA; projection behavior and public routes are unchanged. New tests protect private compatibility files and reject fixture IDs at the student API. The current student allowlist still contains **one exercise**. No new fixtures are approved for students.

Latest verification: **69 server tests**, live API smoke (exercise count 1), eleven paired browser comparisons, twenty-two seed probes, and the standalone positive scaffold diagnostic passed. Sanitized observations are recorded in local files; screenshots remain under the host temporary directory. The previous 23-check browser acceptance and renderer outage results below are historical and were not rerun for this study. Full correct-answer, owned-session, mobile, and accessibility acceptance is still needed for each new candidate.

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
| Safe PG field results | `workspace/server/grading-feedback.mjs` |
| API, student HTML projection, static assets | `workspace/server/http-app.mjs` |
| Picker and next UI work | `workspace/public/index.html`, `picker.css`, `picker.js` |
| Isolated PG content and messages | `workspace/public/exercise-frame.js`, `answer-fields.js`, `answer-bridge.js`, `field-feedback.js` |
| Browser integration tests | `browser-tests/picker.test.mjs` |

Endpoints:

- `GET /api/exercises`: friendly catalog entries, without source paths.
- `POST /api/sessions`: JSON `{ "exerciseId": "dot-product-01" }`.
- `GET /api/sessions/:id`: restore the owned session.
- `POST /api/sessions/:id/answers`: JSON `{ "answers": [["AnSwEr0001", "2 + 3"]] }`, using the actual collected field names. No client seed, path, token, settings, or field manifest.

Session responses contain `session: {id, exerciseId, createdAt}`, `exercise: {html, score, resources}`, and `submission: null` or `{id, number, submittedAt, fieldNames, answers, score, feedback: {message, summary}, fieldFeedback: [{name, status, score, message}]}`. Tokens and seeds remain private. Score is a fraction from 0 to 1.

In `picker.js`, `collectCurrentAnswers()` returns `{sessionId, answers: {fieldNames, entries}}`; submit `answers.entries` as the API's `answers`. Do not convert pairs into an object, which would lose repeated names. Snapshots are browser input; only restored server-trusted HTML defines allowed fields.

Ownership uses `la_experiment_owner`, an HttpOnly/SameSite=Strict cookie, with only its hash stored. Requests are same-origin with strict JSON validation and an 8 KiB body limit. Wrong-owner/unknown sessions return 404; overlapping grades return 409 `SESSION_BUSY`. Current concurrency protection assumes one Node process. Renderer failures leave the old saved state intact; do not automatically retry grading.

## Verification recorded before this documentation update

The complete-experience verification passed **68 server tests and 23 Chromium browser checks**, five live smoke scripts, and the PowerShell renderer smoke check. An abrupt renderer failure/recovery check also passed after fixing the startup PID issue. The full suites and the focused outage rerun are recorded in [PRACTICE_VERIFICATION.md](experimental-workspace/PRACTICE_VERIFICATION.md). New checks cover the keyboard-only flow, Enter/native/IME exceptions, forged shortcut messages, focus preservation and error recovery, conditional accessible descriptions, nonrepeating announcements, assistive mathematics, 320px layout, contrast, forced colors, reduced motion, and 200% CSS zoom. The real exercise test includes invalid syntax, parsed incorrect coordinates, blank fields, partial/correct/incorrect scores, stale feedback on edits, and refresh without another grading request. New browser checks cover fresh values, keyboard activation, duplicate clicks, editing during a request, server/network failures, explicit retry, mobile sizing, and navigation during grading. Desktop/mobile previews were also inspected. Previous backend verification passed renderer-client, sessions, API, grading, and submission-state smoke checks and the PowerShell renderer check. Live grading covered wrong/partial/correct results (0, 0.25, 1) and clearing previously saved answers.

A real forced workspace-container replacement also preserved the same owned session, latest submission metadata, score/feedback, and exact regenerated answer values, including whitespace and empty strings. The workspace-container replacement proof is historical. Server/browser suites and all focused backend/renderer smoke checks were rerun for complete-flow acceptance. The new real renderer outage test verifies 503 recovery, 404 ownership denial while offline, and the unchanged accepted snapshot and mathematical question after restart. Rerun relevant checks after code changes.

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

## Repeatable acceptance and restart fix

From the repository root, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-practice.ps1 -IncludeRendererOutage`. The outage option temporarily force-stops only the renderer; the script restores it in `finally` without deleting volumes. Use `-RendererOutageOnly` for focused recovery checks. Private cookies/submission data stay in memory.

The test exposed a stale `/usr/app/script/hypnotoad.pid` in the renderer container. Hypnotoad treated a reused PID as an existing server, sent a hot-reload signal, and exited 140 on restart. Compose now removes only that runtime file and uses `exec hypnotoad` at startup. Keep the wrapper when updating the upstream image. A normal restart after an abrupt outage is now verified; the runner attempts container replacement on recovery failure but still fails that check.

The student flow handles both a failed request before grading and an accepted grade whose response is lost. Inputs survive both; refresh retrieves the last accepted result without another submission. Explicit retries are new submissions, so general idempotency is still future work.

## Feedback contract and next work

The private renderer `JWT.answer` contains PG results at `score.answers`. `grading-feedback.mjs` reads that configured-server response and projects only field name, status, score, and plain-text PG message. It is not JWT authentication and never accepts a browser grading token. Correct answers and other private claims remain on the server. No instructor request is needed by the student flow.

PG MathObjects uses `error_message` for coordinate hints as well as parser errors. A reported error plus an explicitly absent parsed `student_value`, or an explicit PG error flag, identifies invalid input. Successfully parsed incorrect coordinates remain mathematical errors. Never classify syntax validity from message wording. Per-field statuses are `correct`, `incorrect`, `partial`, `invalid`, `unanswered`, and `ungraded`; suppression of individual results is respected.

The snapshot persists safe `fieldFeedback` with the updated tokens. Older snapshots without it remain valid and obtain field details on the next check. The iframe inserts plain text with accessible field descriptions and invalid-input markers. Editing a checked field marks it changed and flags the overall score as the last checked result. Parent messages remain authenticated by source/origin/channel; the frame stays opaque and live values are preserved.

The keyboard/accessibility implementation is complete for the verified flow. Actual NVDA/VoiceOver listening has not been performed; run that manual review before public release. The initial representative study is complete; its matrix records six native candidates and four blocked fixtures. Next, implement approved asset delivery, ordered PG dependencies, and staged content updates. Compound answers and custom evaluators still need additional coverage.

Use the completed operator compatibility set as a regression fixture while resolving the recorded blockers. Verify each candidate through the real student session flow before enabling it or designing the importer around assumed support. Do not publish all 81k exercises in bulk: indexing, topic relevance, renderer compatibility, source attribution, and licenses still need review. Later integrate Supabase account ownership/progress and durable attempts, plus concurrency suitable for multiple server processes.

## Immediate continuation

1. Address the compatibility matrix blockers: session-aware approved static/generated assets, ordered script/style dependencies, and post-grade problem-content reconciliation. Keep the isolation and edit-preservation contracts. Complete owned-session, positive grading, keyboard, and narrow-screen acceptance for each candidate before enabling it.
2. Design a database catalog for all OPL subjects, with stable IDs, source revisions, multiple topic assignments, licensing/attribution, and verification status. Build a repeatable importer that can index unverified problems without enabling them for students.
3. Add paginated search/browsing and enable validated batches. Supabase account ownership, durable history, idempotency/concurrency, dependency hardening, and manual screen-reader review remain before broad public release.

Keep the existing single-exercise acceptance suite as the regression baseline. See [PRACTICE_VERIFICATION.md](experimental-workspace/PRACTICE_VERIFICATION.md) for the exact verified behavior and reproduction commands.

## Remaining limits

The renderer/editor supports raw PG execution and uses an older upstream dependency stack with reported npm vulnerabilities. This is a localhost development environment, not a production deployment. Hardening and dependency review are required before public hosting. The current HTML projection is not a general-purpose sanitizer; preserve the iframe sandbox and content policy. Graphs, special widgets, and file uploads are not generally supported by the current verified flow.

## Suggested prompt for a fresh session

```text
Read AGENTS.md, PROJECT_CONTEXT.md, experimental-workspace/AGENTS.md, and
experimental-workspace/README.md. Inspect git status and preserve any local
changes. Grading and submission-state persistence already exist. Continue in the Docker sandbox:
the Check answer controls already submit to POST /api/sessions/:id/answers.
Student-safe field/overall feedback is also implemented and restored.
Complete-flow acceptance is recorded in experimental-workspace/PRACTICE_VERIFICATION.md;
preserve the renderer PID cleanup and outage/recovery checks. Actual screen-reader
listening is still a manual release check. Read INTEGRATION_CONTRACT.md and
COMPATIBILITY_MATRIX.md in experimental-workspace, then reproduce the operator
compatibility probes. Resolve approved asset delivery, dependency initialization,
and scaffold content updates before enabling the candidate exercises.
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
