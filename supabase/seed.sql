insert into public.units (slug, title, position)
values
  ('vectors-and-spaces', 'Vectors and spaces', 1),
  ('matrix-transformations', 'Matrix transformations', 2),
  ('alternate-coordinate-systems', 'Alternate coordinate systems', 3)
on conflict (slug) do update
set
  title = excluded.title,
  position = excluded.position;

with theme_seed(unit_slug, slug, title, position) as (
  values
    ('vectors-and-spaces', 'vectors', 'Vectors', 1),
    (
      'vectors-and-spaces',
      'linear-combinations-and-spaces',
      'Linear combinations and spaces',
      2
    ),
    (
      'vectors-and-spaces',
      'linear-dependence-and-independence',
      'Linear dependence and independence',
      3
    ),
    (
      'vectors-and-spaces',
      'subspaces-and-basis',
      'Subspaces and the basis for a subspace',
      4
    ),
    (
      'vectors-and-spaces',
      'vector-dot-and-cross-products',
      'Vector dot and cross products',
      5
    ),
    (
      'vectors-and-spaces',
      'matrices-for-solving-systems-by-elimination',
      'Matrices for solving systems by elimination',
      6
    ),
    (
      'vectors-and-spaces',
      'null-space-and-column-space',
      'Null space and column space',
      7
    )
)
insert into public.themes (unit_id, slug, title, position)
select
  units.id,
  theme_seed.slug,
  theme_seed.title,
  theme_seed.position
from theme_seed
join public.units on units.slug = theme_seed.unit_slug
on conflict (slug) do update
set
  title = excluded.title,
  position = excluded.position,
  unit_id = excluded.unit_id;

with subtheme_seed(theme_slug, slug, title, position) as (
  values
    ('vectors', 'add-vectors', 'Add vectors', 1),
    ('vectors', 'scalar-multiplications', 'Scalar multiplications', 2),
    ('vectors', 'unit-vectors', 'Unit vectors', 3),
    (
      'linear-combinations-and-spaces',
      'linear-combinations-core',
      'Linear combinations core',
      1
    ),
    (
      'linear-dependence-and-independence',
      'dependence-independence-core',
      'Dependence and independence core',
      1
    ),
    ('subspaces-and-basis', 'subspaces-basis-core', 'Subspaces and basis core', 1),
    (
      'vector-dot-and-cross-products',
      'dot-cross-products-core',
      'Dot and cross products core',
      1
    ),
    (
      'matrices-for-solving-systems-by-elimination',
      'elimination-core',
      'Elimination core',
      1
    ),
    ('null-space-and-column-space', 'null-column-space-core', 'Null and column space core', 1)
)
insert into public.subthemes (theme_id, slug, title, position)
select
  themes.id,
  subtheme_seed.slug,
  subtheme_seed.title,
  subtheme_seed.position
from subtheme_seed
join public.themes on themes.slug = subtheme_seed.theme_slug
on conflict (slug) do update
set
  title = excluded.title,
  position = excluded.position,
  theme_id = excluded.theme_id;

-- Keep seed idempotent for MVP development.
delete from public.exercises
using public.subthemes
where public.exercises.subtheme_id = public.subthemes.id;

with exercise_seed(subtheme_slug, type, prompt, solution, difficulty) as (
  values
    (
      'add-vectors',
      'vector_add',
      '{"question":"Compute (2,-1,5) + (4,3,-2)."}'::jsonb,
      '{"result":[6,2,3]}'::jsonb,
      1
    ),
    (
      'add-vectors',
      'vector_subtract',
      '{"question":"Compute (7,0,-3) - (2,5,1)."}'::jsonb,
      '{"result":[5,-5,-4]}'::jsonb,
      1
    ),
    (
      'scalar-multiplications',
      'scalar_mult',
      '{"question":"Compute 3*(1,-2,4)."}'::jsonb,
      '{"result":[3,-6,12]}'::jsonb,
      1
    ),
    (
      'unit-vectors',
      'unit_vector',
      '{"question":"Find a unit vector in direction of (6,8)."}'::jsonb,
      '{"result":[0.6,0.8]}'::jsonb,
      2
    ),
    (
      'linear-combinations-core',
      'linear_combination',
      '{"question":"Express (5,1) as a*(1,1)+b*(1,-1)."}'::jsonb,
      '{"result":{"a":3,"b":2}}'::jsonb,
      3
    ),
    (
      'linear-combinations-core',
      'span_check',
      '{"question":"Is (2,3) in span{(1,0),(0,1)}?"}'::jsonb,
      '{"result":true}'::jsonb,
      1
    ),
    (
      'dependence-independence-core',
      'independence_check',
      '{"question":"Are (1,2) and (2,4) linearly independent?"}'::jsonb,
      '{"result":false}'::jsonb,
      2
    ),
    (
      'subspaces-basis-core',
      'basis_check',
      '{"question":"Do (1,0) and (0,1) form a basis of R2?"}'::jsonb,
      '{"result":true}'::jsonb,
      1
    ),
    (
      'dot-cross-products-core',
      'dot_product',
      '{"question":"Compute v dot w for v=(1,2,3), w=(4,-1,2)."}'::jsonb,
      '{"result":8}'::jsonb,
      2
    ),
    (
      'elimination-core',
      'matrix_mult',
      '{"question":"Compute [[1,2],[0,1]] * [[3,1],[2,4]]."}'::jsonb,
      '{"result":[[7,9],[2,4]]}'::jsonb,
      2
    ),
    (
      'null-column-space-core',
      'null_space_dim',
      '{"question":"What is dim(null(A)) if A is 3x3 full rank?"}'::jsonb,
      '{"result":0}'::jsonb,
      2
    )
)
insert into public.exercises (subtheme_id, type, prompt, solution, difficulty)
select
  subthemes.id,
  exercise_seed.type,
  exercise_seed.prompt,
  exercise_seed.solution,
  exercise_seed.difficulty
from exercise_seed
join public.subthemes on subthemes.slug = exercise_seed.subtheme_slug;
