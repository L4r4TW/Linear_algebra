# Project Context

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

The initial schema is in `supabase/schema.sql`, but it is not the complete current database shape by itself. Apply migrations from `supabase/migrations/` after the base schema.

Recommended fresh setup order:

1. Run `supabase/schema.sql`.
2. Run each SQL file in `supabase/migrations/` in filename order.
3. Run `supabase/seed.sql`.
4. Create/sign in a user.
5. Set that user as admin manually:

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

- `README.md` is stale and still describes admin authoring as future work.
- `PracticeRunner` exists at `src/app/practice/[topic]/practice-runner.tsx` but appears superseded by `ExerciseAttemptCard`.
- Production build may fail in restricted-network environments because `next/font/google` fetches Google Fonts.
- Seeded exercises may be hidden because they default to `draft`.
- Grading is mostly client-side and exact-match based; mathematical equivalence is not implemented.
- Some exercise formats rely on JSON config in the admin editor, so authoring UX may still need polish.
- There are no dedicated automated tests beyond lint/admin smoke checks.

## Suggested Next Work

1. Update `README.md` to reflect the current app, admin features, and correct database setup.
2. Decide whether to publish seeded exercises by default or keep them as drafts.
3. Remove or repurpose the unused `PracticeRunner`.
4. Add tests for exercise payload conversion and grading helpers.
5. Consider self-hosted/local fonts to avoid network-dependent production builds.
6. Improve grading for linear algebra answers beyond exact JSON/string matching.
7. Add richer admin UX for exercise formats that currently require direct JSON config editing.

## Future Codex Session Prompt

Use this prompt in a new session:

```text
Please read PROJECT_CONTEXT.md and README.md, inspect the repo, and then help me continue development from the current state.
```
