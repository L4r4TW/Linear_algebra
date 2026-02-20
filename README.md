# Linear Algebra Exercises

Open source exercise platform for the Khan Academy linear algebra track.
Built with Next.js App Router and Supabase Postgres.

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Set environment variables:

```bash
cp .env.example .env.local
```

Then fill in:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. Create database schema in the Supabase SQL Editor:
- Run `supabase/schema.sql`
- Run `supabase/seed.sql`

4. Start development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## MVP Database

- `profiles`: one row per auth user.
- `topics`: groups exercises (for example vectors, matrices).
- `exercises`: exercise definitions per topic.
- `attempts`: user submissions and correctness history.

## Project Structure

- `src/app`: App Router pages/layout.
- `src/lib/supabase`: typed Supabase clients.
- `src/types/database.ts`: starter DB typings.
- `supabase/schema.sql`: initial schema.
- `supabase/seed.sql`: starter records.

## Scripts

- `npm run dev`: local dev server.
- `npm run lint`: lint code.
- `npm run build`: production build.

## Recommended Next Work

1. Add row-level security (RLS) policies.
2. Add dynamic routes: `topics/[slug]`, `exercises/[id]`.
3. Build attempt submission API route and scoring logic.
4. Build an admin authoring UI for exercises.
