create extension if not exists "pgcrypto";

-- Dev reset: removes legacy schema from previous iterations.
drop table if exists public.attempts cascade;
drop table if exists public.exercises cascade;
drop table if exists public.lessons cascade;
drop table if exists public.units cascade;
drop table if exists public.topics cascade;
drop table if exists public.profiles cascade;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  created_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  type text not null,
  prompt jsonb not null,
  solution jsonb not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  created_at timestamptz not null default now()
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  is_correct boolean not null,
  answer jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_exercises_topic_id
  on public.exercises(topic_id);

create index idx_attempts_user_id_created_at
  on public.attempts(user_id, created_at desc);

create index idx_attempts_exercise_id
  on public.attempts(exercise_id);

-- RLS
alter table public.profiles enable row level security;
alter table public.attempts enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Optional: make usernames public (all rows readable).
-- Keep commented out unless you want public profile discovery.
-- drop policy if exists "profiles_select_public" on public.profiles;
-- create policy "profiles_select_public"
--   on public.profiles
--   for select
--   using (true);

drop policy if exists "attempts_select_own" on public.attempts;
create policy "attempts_select_own"
  on public.attempts
  for select
  using (auth.uid() = user_id);

drop policy if exists "attempts_insert_own" on public.attempts;
create policy "attempts_insert_own"
  on public.attempts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "attempts_update_own" on public.attempts;
create policy "attempts_update_own"
  on public.attempts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "attempts_delete_own" on public.attempts;
create policy "attempts_delete_own"
  on public.attempts
  for delete
  using (auth.uid() = user_id);
