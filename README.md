# Linear Algebra Exercises

Open source practice platform, originally focused on linear algebra and now expanding toward all subjects in the WeBWorK Open Problem Library (OPL).

The original application uses Next.js App Router and Supabase. Its course content is organized as:

```text
Units -> Themes -> Subthemes -> Exercises
```

Students can browse topics, solve exercises, and save progress. Admin users can manage the course structure and author exercises.

## Continue development here

The [full-library model audit (5.1)](experimental-workspace/CATALOG_MODEL_AUDIT.md) maps existing catalog, session, compatibility and Supabase data to the proposed platform model. It includes measured OPL metadata coverage, reusable contracts and migration gaps. The [identity/source-version contract (5.2)](experimental-workspace/EXERCISE_IDENTITY.md) now defines stable IDs, permanent aliases, version history and update/withdrawal rules. The [topic hierarchy and mapping design (5.3)](experimental-workspace/TOPIC_TAXONOMY.md) now adds raw/curated classifications, cross-topic assignments, and chooser/count behavior. The [student-facing metadata contract (5.4)](experimental-workspace/CATALOG_METADATA.md) adds tested projection/search examples and a [local card preview](experimental-workspace/catalog-model/catalog-metadata-preview.html). The preview is separate from the live app. The [compatibility/evidence and activation model (5.5)](experimental-workspace/COMPATIBILITY_DATA_MODEL.md) now includes a checked read-only projection preserving the six enabled entries and all historical failures. The [student-record/privacy model (5.6)](experimental-workspace/STUDENT_RECORDS_PRIVACY.md) now defines ownership, guest-account claims, private state, attempts/drafts and suppression-aware progress, with synthetic checks. The [database design and isolated PostgreSQL lab (5.7)](experimental-workspace/DATABASE_DESIGN.md) now validates critical constraints, query plans and a real concurrent draft race using synthetic data. Next: additive migrations/upgrade validation (5.8), before bulk ingestion or live database changes.

Latest implementation: [`3eefcbb`](https://github.com/L4r4TW/Linear_algebra/commit/3eefcbb), pushed to `main`. The feedback/continuity milestone is complete within the six-exercise local scope. Next work includes manual screen-reader/physical-device acceptance, account/persistence decisions and a multi-subject metadata importer with disabled-by-default verification batches. The full OPL is already stored in a Docker Linux volume; it is not yet a student-accessible catalog.

[Continuity acceptance](experimental-workspace/CONTINUITY_VERIFICATION.md) now verifies refresh, lost responses, draft failures, navigation, same-owner tabs and real renderer shutdown/recovery on desktop/mobile. It records current evidence, reproduction commands and remaining manual accessibility checks.

The current WeBWorK integration is in **[experimental-workspace/](experimental-workspace/README.md)**, separate from the original Next.js/Supabase application described below. Read **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** for the session handoff and **[AGENTS.md](AGENTS.md)** for development conventions.

| Application | Address | Purpose |
| --- | --- | --- |
| Original Next.js app | http://localhost:3000 | Existing course, admin, and Supabase features |
| Experimental practice UI | http://localhost:3100 | Current PG integration work |
| WeBWorK renderer editor | http://localhost:3101 | Local operator diagnostics |

Start Docker Desktop with its Linux engine ready, then run from the repository root:

```powershell
cd experimental-workspace
docker compose up --build -d --wait --wait-timeout 240
```

This assumes the existing OPL Docker volume is available. For a new machine, follow the [OPL volume setup](experimental-workspace/README.md#open-problem-library-volume) first. Keep the large library in Docker's Linux volume; do not clone it into Google Drive.

The sandbox now enables a first local batch of **six verified exercises** across linear algebra, calculus, statistics and algebra, including **Dot products and vector operations** (`dot-product-01`). See the [catalog rules](experimental-workspace/CATALOG_COMPATIBILITY.md) and [eligibility record](experimental-workspace/compatibility/CATALOG_STATUS.md) for the five indexed candidates that remain disabled. It includes isolated answer fields, Check answer controls, per-field feedback, partial credit, keyboard navigation, mobile layout, and saved session state.

Latest implementation validation (`3eefcbb`, 2026-11-15): **173 server tests, 62 browser checks, all six focused continuity cases and two real renderer-outage viewport cases passed**, along with the live six-exercise API check. The 14 publisher/report checks and full seeded gate are earlier evidence for the unchanged runtime. The full 44-case compatibility run retains two mobile GraphTool failures; GraphTool remains disabled. The [importer contract](experimental-workspace/CATALOG_COMPATIBILITY.md) explains status, capability requirements, batch activation, withdrawal, and stale evidence.

The [continuity and feedback audit](experimental-workspace/CONTINUITY_FEEDBACK_AUDIT.md) now checks all six enabled exercises and retains the historical restoration/feedback gap checklist. Same-session restoration now includes [unfinished tab drafts](experimental-workspace/DRAFT_PERSISTENCE.md), including repeated-name choices, with checked feedback marked stale when appropriate. [Explicit session recovery](experimental-workspace/SESSION_RECOVERY.md) now distinguishes transient service failures from expired/rejected/withdrawn sessions and protects live edits during saved-result reload. Missing/unowned sessions share a privacy-safe message. The [PG feedback model](experimental-workspace/FEEDBACK_MODEL.md) now documents all grading states and verifies them through 20 real-PG cases at two seeds, including withheld feedback, named-field binding, refresh and stale/revert behavior. [Safe PG feedback presentation](experimental-workspace/FEEDBACK_PRESENTATION.md) now preserves readable breaks and reviewed notation, with inert HTML and literal fallback. [Authored hint support](experimental-workspace/AUTHORED_HINTS.md) is implemented, with View hint shown only for available PG content. [Protected retry and move-on controls](experimental-workspace/PRACTICE_ACTIONS.md) are implemented locally, including explicit new-session labels and draft-aware leaving.

The previous complete-flow verification passed **68 server tests and 23 browser checks**, all live smoke checks, and a real renderer failure/recovery test. That test found and fixed a stale PID-file restart bug. See the [acceptance report](experimental-workspace/PRACTICE_VERIFICATION.md) for evidence and limits.

Repeat the complete verification from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/verify-practice.ps1 -IncludeRendererOutage
```

The outage option briefly interrupts only the experimental renderer and restores it without removing volumes. Omit it for ordinary verification. Unsubmitted edits are not saved; ownership currently belongs to the anonymous browser cookie rather than a Supabase account. Actual screen-reader listening remains a manual release check.

The initial [integration contract](experimental-workspace/INTEGRATION_CONTRACT.md) and [compatibility matrix](experimental-workspace/COMPATIBILITY_MATRIX.md) document eleven real OPL fixtures at two seeds. Seven native-answer paths include the existing baseline; four fixtures expose gaps in static/generated images, staged content, and GraphTool. At that stage, the [operator test catalog](experimental-workspace/compatibility/catalog.json) did not expand the student catalog. This study passed 69 server tests and the live API smoke check; the earlier 23-check acceptance suite was not rerun for it.

The [controlled asset loader](experimental-workspace/ASSET_LOADING.md) now supports the tested images, ordered PG scripts/styles, GraphTool toolbar/state, and scaffold toggles while keeping renderer paths and tokens private. The follow-up passes 76 server tests, 24 browser checks, and all eleven paired fixture comparisons. The [widget answer verification](experimental-workspace/WIDGET_VERIFICATION.md) now adds visible graph feedback/change/focus handling and real owned-session positive grading/restoration across all eleven fixtures, with 77 server tests and 26 browser checks. The [styling contract](experimental-workspace/STYLING_CONTRACT.md) now separates shell and exercise CSS, scopes native/prose/feedback overrides, and protects widget geometry. Validation passes 77 server tests, 28 browser checks, and eleven style-audited widget cases. The [automated compatibility command](experimental-workspace/COMPATIBILITY_REGRESSION.md) now exercises both fixture seeds on desktop and touch-mobile and generates visible capability reports. It keeps mobile GraphTool touch grading as a failing gate. The new capability gate enables individually verified candidates while retaining GraphTool, scaffold and narrow-layout blockers for the rest. Build the multi-subject database catalog and repeatable importer around explicit verification status.

Source is copied into Docker images: rebuild after edits. Saved sessions survive rebuilds in a named volume; `docker compose down --volumes` deletes them. Keep renderer/editor ports private; this development setup is not ready for public deployment.

## Original application: tech stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase Postgres/Auth/RLS
- `@supabase/ssr`
- `react-hook-form`
- `zod`
- `react-markdown`
- `remark-math`
- `rehype-katex`
- `katex`

## Getting Started

Install dependencies:

```bash
npm install
```

Create `.env.local` at the repository root with:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Database Setup

For complete Supabase setup instructions, see `DATABASE_SETUP.md`.

Fresh setup order:

1. `supabase/schema.sql`
2. `supabase/migrations/20260221_admin_exercise_panel.sql`
3. `supabase/migrations/20260221_admin_structure_rls.sql`
4. `supabase/migrations/20260221_remove_archived_status.sql`
5. `supabase/seed.sql`

Important: `supabase/schema.sql` is a development reset script and drops existing project tables. Do not rerun it casually against a database with data you want to keep.

## Scripts

```bash
npm run dev
npm run lint
npm run smoke:admin
npm run build
```

- `npm run dev`: start local development server.
- `npm run lint`: run ESLint.
- `npm run smoke:admin`: verify admin-related files exist and lint passes.
- `npm run build`: create a production build.

Production build caveat: the app currently uses `next/font/google` for Geist fonts. In restricted-network environments, `npm run build` can fail while fetching Google Fonts.

## Features

- Course browsing by units, themes, and subthemes.
- Published exercise listing per subtheme.
- Progress display based on correct attempts.
- Supabase email/password login and signup.
- Profile page with attempt stats, accuracy, streak, and recent attempts.
- Attempt saving for logged-in users.
- Admin-only structure management for units, themes, and subthemes.
- Admin-only exercise management with draft/published workflow.
- Markdown and LaTeX rendering for exercise prompts.
- Exercise authoring with live preview and autosave.

Supported exercise formats include:

- text/JSON answer comparison
- vector coordinate reading from graph
- point/vector plotting on an interactive plane
- single choice
- multi-select
- equal-vector picking
- multi-part exercises

## Project Structure

- `src/app`: Next.js App Router pages and layouts.
- `src/app/practice`: student practice pages.
- `src/app/admin`: admin pages and server actions.
- `src/components/admin`: admin editor, structure manager, and graph components.
- `src/components/content`: markdown/LaTeX rendering.
- `src/components/ui`: small shared UI primitives.
- `lib/supabase`: canonical Supabase server/browser clients.
- `src/lib/supabase`: re-exports for `@/lib/...` imports.
- `src/types/database.ts`: Supabase database typings.
- `supabase/schema.sql`: base dev schema.
- `supabase/migrations`: database migrations.
- `supabase/seed.sql`: starter content.
- `PROJECT_CONTEXT.md`: current project handoff notes for future development sessions.

## Admin Access

Admin access is controlled by the `profiles.role` column.

- `student`: normal user.
- `admin`: can access `/admin/exercises` and `/admin/structure`.

The root layout only shows the Admin navigation link when the signed-in user has `profiles.role = 'admin'`.

## Current Development Notes

See `PROJECT_CONTEXT.md` for a fuller handoff, including known gaps and suggested next work.
