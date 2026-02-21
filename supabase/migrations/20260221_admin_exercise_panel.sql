-- Admin panel migration: markdown content + draft/publish workflow + admin RLS.

alter table public.profiles
add column if not exists role text not null default 'student'
check (role in ('student', 'admin'));

alter table public.exercises
add column if not exists title text not null default 'Untitled exercise',
add column if not exists prompt_md text not null default '',
add column if not exists solution_md text not null default '',
add column if not exists choices jsonb not null default '[]'::jsonb,
add column if not exists hints jsonb not null default '[]'::jsonb,
add column if not exists tags jsonb not null default '[]'::jsonb,
add column if not exists status text not null default 'draft'
  check (status in ('draft', 'published', 'archived')),
add column if not exists created_by uuid references public.profiles(id) on delete set null,
add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_exercises_status on public.exercises(status);
create index if not exists idx_exercises_subtheme_status on public.exercises(subtheme_id, status);

-- Existing prompt/solution jsonb can remain for backward compatibility.

alter table public.exercises enable row level security;

drop policy if exists "exercises_select_all" on public.exercises;
create policy "exercises_select_all"
  on public.exercises
  for select
  using (true);

drop policy if exists "exercises_insert_admin" on public.exercises;
create policy "exercises_insert_admin"
  on public.exercises
  for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

drop policy if exists "exercises_update_admin" on public.exercises;
create policy "exercises_update_admin"
  on public.exercises
  for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

drop policy if exists "exercises_delete_admin" on public.exercises;
create policy "exercises_delete_admin"
  on public.exercises
  for delete
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
