-- Remove archived status from exercises.

update public.exercises
set status = 'draft'
where status = 'archived';

alter table public.exercises
drop constraint if exists exercises_status_check;

alter table public.exercises
add constraint exercises_status_check
check (status in ('draft', 'published'));
