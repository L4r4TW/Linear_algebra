# Linear Algebra Exercises

Open source practice platform, originally focused on linear algebra and now expanding toward all subjects in the WeBWorK Open Problem Library (OPL).

The original application uses Next.js App Router and Supabase. Its course content is organized as:

```text
Units -> Themes -> Subthemes -> Exercises
```

Students can browse topics, solve exercises, and save progress. Admin users can manage the course structure and author exercises.

## Continue development here

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

Latest catalog validation: **100 server tests, 29 browser checks, and 14 publisher/report tests passed**, along with the live six-exercise API check. The full 44-case compatibility run retains two mobile GraphTool failures; GraphTool remains disabled. The [importer contract](experimental-workspace/CATALOG_COMPATIBILITY.md) explains status, capability requirements, batch activation, withdrawal, and stale evidence.

The [continuity and feedback audit](experimental-workspace/CONTINUITY_FEEDBACK_AUDIT.md) now checks all six enabled exercises and separates working restoration/feedback from missing drafts, hints and recovery actions. Same-session restoration works; unchecked edits are lost on refresh. Durable session-bound drafts are the next implementation task.

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
