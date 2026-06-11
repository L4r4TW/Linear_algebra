# Linear Algebra Exercises

Open source linear algebra practice platform aligned with the Khan Academy linear algebra track.

The app is built with Next.js App Router and Supabase. Course content is organized as:

```text
Units -> Themes -> Subthemes -> Exercises
```

Students can browse topics, solve exercises, and save progress. Admin users can manage the course structure and author exercises.

## Tech Stack

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

Create local environment variables:

```bash
cp .env.example .env.local
```

Fill in:

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
