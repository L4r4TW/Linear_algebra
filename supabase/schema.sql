create extension if not exists "pgcrypto";

create type exercise_difficulty as enum ('easy', 'medium', 'hard');

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  position integer not null unique check (position > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  title text not null,
  slug text not null unique,
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (unit_id, position)
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title text not null,
  prompt text not null,
  solution text not null,
  difficulty exercise_difficulty not null default 'medium',
  source_ref text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lessons_unit_position
  on public.lessons(unit_id, position);

create index if not exists idx_exercises_lesson
  on public.exercises(lesson_id);
