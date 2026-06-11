# Database Setup

This project uses Supabase Postgres, Supabase Auth, and row-level security policies.

The database files are split into:

- `supabase/schema.sql`: base development schema.
- `supabase/migrations/*.sql`: changes added after the base schema.
- `supabase/seed.sql`: starter course structure and starter exercises.

## Required Environment Variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Only the public anon key is needed by the app. Do not commit service-role keys.

## Fresh Supabase Project Setup

Run SQL in this exact order in the Supabase SQL editor:

1. `supabase/schema.sql`
2. `supabase/migrations/20260221_admin_exercise_panel.sql`
3. `supabase/migrations/20260221_admin_structure_rls.sql`
4. `supabase/migrations/20260221_remove_archived_status.sql`
5. `supabase/seed.sql`

The base schema is intentionally not the whole current schema. The migrations add admin roles, exercise authoring fields, draft/published status, and RLS policies for admin-managed tables.

## Existing Supabase Project Setup

If the base schema has already been applied, do not rerun `supabase/schema.sql` casually. It contains `drop table if exists ... cascade` statements for development resets.

For an existing project, apply only migrations that have not already been run, then run `supabase/seed.sql` if starter content is needed.

## Admin User Setup

Admin access is controlled by `public.profiles.role`.

1. Start the app.
2. Sign up or log in at `/login`.
3. Submit at least one attempt or otherwise create a matching `profiles` row.
4. In Supabase SQL editor, promote the user:

```sql
update public.profiles
set role = 'admin'
where id = '<auth-user-id>';
```

Then refresh the app. Admin users can access:

- `/admin/exercises`
- `/admin/structure`

## Seeded Exercise Status

`supabase/seed.sql` inserts starter exercises without an explicit `status`.

After `20260221_admin_exercise_panel.sql`, the default status is `draft`. The practice pages only show exercises where:

```sql
status = 'published'
```

To make seeded exercises visible immediately, run:

```sql
update public.exercises
set status = 'published'
where status = 'draft';
```

Alternatively, keep seeded exercises as drafts and publish them from `/admin/exercises`.

## Verification Queries

Use these queries in Supabase SQL editor after setup.

Check tables have data:

```sql
select count(*) as units_count from public.units;
select count(*) as themes_count from public.themes;
select count(*) as subthemes_count from public.subthemes;
select count(*) as exercises_count from public.exercises;
```

Check exercise statuses:

```sql
select status, count(*)
from public.exercises
group by status
order by status;
```

Check profiles and roles:

```sql
select id, username, role, created_at
from public.profiles
order by created_at desc;
```

Check visible published exercise count:

```sql
select count(*) as published_exercises
from public.exercises
where status = 'published';
```

## RLS Summary

Public read:

- `units`
- `themes`
- `subthemes`
- `exercises`

Admin-only writes:

- `units`
- `themes`
- `subthemes`
- `exercises`

User-owned rows:

- `profiles`
- `attempts`

Admin checks use:

```sql
exists (
  select 1
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'admin'
)
```

## Local Development Notes

- The app uses the Supabase anon key on both server and browser clients.
- Server components and server actions use `lib/supabase/server.ts`.
- Client components use `lib/supabase/client.ts`.
- Database typings live in `src/types/database.ts`.
- If database columns are changed, regenerate or manually update `src/types/database.ts`.

## Common Setup Problems

If the homepage says Supabase environment variables are missing, check `.env.local`.

If `/practice` shows themes but no exercises, check whether exercises are still drafts.

If admin pages show "Admin access required", check the current user's `profiles.role`.

If saving attempts fails because of a profile foreign-key error, make sure the logged-in user has a matching row in `public.profiles`.
