-- Admin-only write access for units/themes/subthemes.

alter table public.units enable row level security;
alter table public.themes enable row level security;
alter table public.subthemes enable row level security;

-- Public read policies

drop policy if exists "units_select_all" on public.units;
create policy "units_select_all"
  on public.units
  for select
  using (true);

drop policy if exists "themes_select_all" on public.themes;
create policy "themes_select_all"
  on public.themes
  for select
  using (true);

drop policy if exists "subthemes_select_all" on public.subthemes;
create policy "subthemes_select_all"
  on public.subthemes
  for select
  using (true);

-- Admin write policies

drop policy if exists "units_insert_admin" on public.units;
create policy "units_insert_admin"
  on public.units
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "units_update_admin" on public.units;
create policy "units_update_admin"
  on public.units
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "units_delete_admin" on public.units;
create policy "units_delete_admin"
  on public.units
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "themes_insert_admin" on public.themes;
create policy "themes_insert_admin"
  on public.themes
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "themes_update_admin" on public.themes;
create policy "themes_update_admin"
  on public.themes
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "themes_delete_admin" on public.themes;
create policy "themes_delete_admin"
  on public.themes
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "subthemes_insert_admin" on public.subthemes;
create policy "subthemes_insert_admin"
  on public.subthemes
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "subthemes_update_admin" on public.subthemes;
create policy "subthemes_update_admin"
  on public.subthemes
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "subthemes_delete_admin" on public.subthemes;
create policy "subthemes_delete_admin"
  on public.subthemes
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
