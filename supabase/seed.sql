insert into public.units (title, slug, position)
values
  ('Vectors and spaces', 'vectors-and-spaces', 1),
  ('Matrix transformations', 'matrix-transformations', 2),
  ('Matrix multiplication', 'matrix-multiplication', 3)
on conflict (slug) do nothing;

with selected_unit as (
  select id from public.units where slug = 'vectors-and-spaces'
)
insert into public.lessons (unit_id, title, slug, position)
select
  selected_unit.id,
  'Introduction to vectors',
  'introduction-to-vectors',
  1
from selected_unit
on conflict (slug) do nothing;

with selected_lesson as (
  select id from public.lessons where slug = 'introduction-to-vectors'
)
insert into public.exercises (lesson_id, title, prompt, solution, difficulty, source_ref)
select
  selected_lesson.id,
  'Vector length in R2',
  'Find the length of v = (3, 4).',
  '||v|| = sqrt(3^2 + 4^2) = 5.',
  'easy',
  'khan-linear-algebra: vectors'
from selected_lesson
on conflict do nothing;
